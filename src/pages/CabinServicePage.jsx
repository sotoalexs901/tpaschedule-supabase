import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useUser } from "../UserContext.jsx";
import { db } from "../firebase";
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

const ROLE_OPTIONS = ["Supervisor", "LAV", "Agent"];

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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    dark: {
      background: "#0f172a",
      color: "#ffffff",
      border: "none",
      boxShadow: "0 12px 24px rgba(15,23,42,0.14)",
    },
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
      boxShadow: "none",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function prettifyCodeName(value) {
  const clean = normalizeText(value);
  if (!clean) return "";

  if (
    clean.includes(" ") &&
    !clean.includes("_") &&
    !clean.includes(".") &&
    !/@/.test(clean)
  ) {
    return clean;
  }

  if (/^[a-z]+\.[a-z]+$/i.test(clean)) {
    return clean
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  if (/^[a-z]+_[a-z]+$/i.test(clean)) {
    return clean
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  if (/@/.test(clean)) {
    const left = clean.split("@")[0] || clean;
    return prettifyCodeName(left);
  }

  if (/^[a-z]+[0-9]*$/i.test(clean) && clean === clean.toLowerCase()) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean;
}

function getEmployeeVisibleName(emp) {
  return (
    emp?.name ||
    emp?.fullName ||
    emp?.employeeName ||
    emp?.displayName ||
    emp?.username ||
    emp?.loginUsername ||
    "Unnamed Employee"
  );
}

function toMinutes(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function calcCalendarHours(start, end) {
  if (!start || !end) return 0;

  let s = toMinutes(start);
  let e = toMinutes(end);

  if (e <= s) e += 24 * 60;

  return Number(((e - s) / 60).toFixed(2));
}

function calcPaidHours(start, end) {
  if (!start || !end) return 0;

  let s = toMinutes(start);
  let e = toMinutes(end);

  if (e <= s) e += 24 * 60;

  let minutes = e - s;

  if (minutes >= 361) {
    minutes -= 30;
  }

  return Number((minutes / 60).toFixed(2));
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
    if ((a.start || "") !== (b.start || "")) return (a.start || "").localeCompare(b.start || "");
    if ((a.end || "") !== (b.end || "")) return (a.end || "").localeCompare(b.end || "");
    return (a.role || "").localeCompare(b.role || "");
  });
}

export default function CabinServicePage() {
  const { user } = useUser();

  const [weekStartDate, setWeekStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
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
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function loadEmployees() {
      try {
        setLoadingEmployees(true);

        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((emp) => emp.active !== false)
          .map((emp) => ({
            id: emp.id,
            ...emp,
            name: getEmployeeVisibleName(emp),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees:", err);
        setError("Error loading employees.");
      } finally {
        setLoadingEmployees(false);
      }
    }

    loadEmployees().catch(console.error);
  }, []);

  const uploadedDaysCount = useMemo(() => {
    return DAY_KEYS.filter((day) => !!dayFiles[day]).length;
  }, [dayFiles]);

  const assignedCount = useMemo(() => {
    return Object.values(weeklySlots)
      .flat()
      .filter((slot) => slot.employeeId || slot.employeeName).length;
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
        const slots = generateCabinShifts(demandBlocks, dayKey).map((slot) => ({
          ...slot,
          employeeId: slot.employeeId || "",
          employeeName: prettifyCodeName(slot.employeeName || ""),
          role: slot.role || "Agent",
          calendarHours: calcCalendarHours(slot.start, slot.end),
          paidHours: calcPaidHours(slot.start, slot.end),
          status: slot.employeeId || slot.employeeName ? "assigned" : "open",
        }));

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
        [dayKey]: daySlots.map((slot) => {
          if (slot.id !== slotId) return slot;

          const selectedEmployee = employees.find((emp) => emp.id === employeeId);

          return {
            ...slot,
            employeeId,
            employeeName: selectedEmployee?.name || "",
            status: employeeId ? "assigned" : "open",
          };
        }),
      };
    });
  }

  function handleSlotFieldChange(dayKey, slotId, field, value) {
    setWeeklySlots((prev) => {
      const daySlots = prev[dayKey] || [];

      return {
        ...prev,
        [dayKey]: daySlots.map((slot) => {
          if (slot.id !== slotId) return slot;

          const updated = { ...slot };

          if (field === "employeeId") {
            const selectedEmployee = employees.find((emp) => emp.id === value);
            updated.employeeId = value;
            updated.employeeName = selectedEmployee?.name || "";
            updated.status = value ? "assigned" : "open";
          } else if (field === "employeeName") {
            updated.employeeName = prettifyCodeName(value);
            updated.status = value ? "assigned" : "open";
          } else {
            updated[field] = value;
          }

          if (field === "start" || field === "end") {
            updated.calendarHours = calcCalendarHours(
              field === "start" ? value : updated.start,
              field === "end" ? value : updated.end
            );
            updated.paidHours = calcPaidHours(
              field === "start" ? value : updated.start,
              field === "end" ? value : updated.end
            );
          }

          return updated;
        }),
      };
    });
  }

  function handleAddShiftRow(dayKey) {
    const newRowId = `manual-${dayKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setWeeklySlots((prev) => {
      const currentDaySlots = prev[dayKey] || [];
      return {
        ...prev,
        [dayKey]: [
          ...currentDaySlots,
          {
            id: newRowId,
            dayKey,
            start: "",
            end: "",
            role: "Agent",
            employeeId: "",
            employeeName: "",
            calendarHours: 0,
            paidHours: 0,
            status: "open",
            source: "manual",
          },
        ],
      };
    });
  }

  function handleDeleteShiftRow(dayKey, slotId) {
    const confirmed = window.confirm("Delete this shift row?");
    if (!confirmed) return;

    setWeeklySlots((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] || []).filter((slot) => slot.id !== slotId),
    }));
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

      const cleanedWeeklySlots = Object.fromEntries(
        Object.entries(weeklySlots).map(([dayKey, slots]) => [
          dayKey,
          (slots || []).map((slot) => ({
            ...slot,
            employeeName: prettifyCodeName(slot.employeeName || ""),
            calendarHours: calcCalendarHours(slot.start, slot.end),
            paidHours: calcPaidHours(slot.start, slot.end),
            status: slot.employeeId || slot.employeeName ? "assigned" : "open",
          })),
        ])
      );

      const createdByName =
        user?.displayName ||
        user?.fullName ||
        user?.name ||
        prettifyCodeName(user?.username) ||
        user?.username ||
        user?.id ||
        "";

      const scheduleId = await saveCabinWeeklySchedule({
        weekStartDate,
        weeklyFlights,
        weeklyDemandBlocks,
        weeklySlots: cleanedWeeklySlots,
        createdBy: createdByName,
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

        <div style={{ position: "relative" }}>
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
            Cabin Service Weekly Schedule
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Upload daily flight files, generate the weekly staffing plan,
            add extra shift rows if needed, assign employees, and save the final schedule.
          </p>
        </div>
      </div>

      {step === "upload" && (
        <PageCard style={{ padding: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Create Weekly Schedule
          </h2>

          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Week Start Date</label>
            <input
              type="date"
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: 22 }}>
            <h3 style={subTitleStyle}>Upload Daily Flight Files</h3>

            <div style={uploadGridStyle}>
              {DAY_KEYS.map((dayKey) => (
                <div key={dayKey} style={uploadBoxStyle}>
                  <div
                    style={{
                      fontWeight: 800,
                      marginBottom: 10,
                      color: "#0f172a",
                      fontSize: 14,
                    }}
                  >
                    {DAY_LABELS[dayKey]}
                  </div>

                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) =>
                      handleFileChange(dayKey, e.target.files?.[0] || null)
                    }
                    style={{ fontSize: 13 }}
                  />

                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#475569",
                      lineHeight: 1.4,
                    }}
                  >
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

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#edf7ff",
                border: "1px solid #cfe7fb",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                color: "#1769aa",
                fontWeight: 700,
              }}
            >
              Uploaded days: <b>{uploadedDaysCount}/7</b>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                color: "#475569",
                fontWeight: 700,
              }}
            >
              Employees loaded: <b>{loadingEmployees ? "..." : employees.length}</b>
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: 14,
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

          <div style={{ marginTop: 20 }}>
            <ActionButton
              onClick={handleGenerateWeeklySchedule}
              variant="primary"
              disabled={loading || loadingEmployees}
            >
              {loading ? "Generating..." : "Generate Weekly Schedule"}
            </ActionButton>
          </div>
        </PageCard>
      )}

      {step === "assignment" && (
        <>
          <PageCard style={{ padding: 20 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Weekly Summary
            </h2>

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
          </PageCard>

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
              <PageCard key={dayKey} style={{ padding: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {DAY_LABELS[dayKey]}
                    </h2>

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
                  </div>

                  <ActionButton
                    onClick={() => handleAddShiftRow(dayKey)}
                    variant="primary"
                  >
                    + Add Shift Row
                  </ActionButton>
                </div>

                <div style={{ marginTop: 18 }}>
                  <h3 style={subTitleStyle}>Generated Shifts</h3>
                  {shiftSummary.length ? (
                    <div style={chipWrapStyle}>
                      {shiftSummary.map((item) => (
                        <div
                          key={`${dayKey}-${item.start}-${item.end}-${item.role}`}
                          style={chipStyle}
                        >
                          {item.start || "--:--"}–{item.end || "--:--"} | {item.role || "Agent"} x{item.count}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={emptyTextStyle}>No shifts generated</div>
                  )}
                </div>

                <div style={{ marginTop: 20 }}>
                  <h3 style={subTitleStyle}>Flights</h3>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRowStyle}>
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

                <div style={{ marginTop: 22 }}>
                  <h3 style={subTitleStyle}>Assign Employees</h3>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRowStyle}>
                          <th style={thTdStyle}>Start</th>
                          <th style={thTdStyle}>End</th>
                          <th style={thTdStyle}>Role</th>
                          <th style={thTdStyle}>Paid Hours</th>
                          <th style={thTdStyle}>Employee</th>
                          <th style={thTdStyle}>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((slot) => (
                          <tr key={`${dayKey}-${slot.id}`}>
                            <td style={thTdStyle}>
                              <input
                                type="time"
                                value={slot.start || ""}
                                onChange={(e) =>
                                  handleSlotFieldChange(dayKey, slot.id, "start", e.target.value)
                                }
                                style={miniInputStyle}
                              />
                            </td>

                            <td style={thTdStyle}>
                              <input
                                type="time"
                                value={slot.end || ""}
                                onChange={(e) =>
                                  handleSlotFieldChange(dayKey, slot.id, "end", e.target.value)
                                }
                                style={miniInputStyle}
                              />
                            </td>

                            <td style={thTdStyle}>
                              <select
                                value={slot.role || "Agent"}
                                onChange={(e) =>
                                  handleSlotFieldChange(dayKey, slot.id, "role", e.target.value)
                                }
                                style={selectStyle}
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td style={thTdStyle}>
                              {calcPaidHours(slot.start, slot.end).toFixed(2)}
                            </td>

                            <td style={thTdStyle}>
                              <select
                                value={slot.employeeId || ""}
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

                            <td style={thTdStyle}>
                              <ActionButton
                                onClick={() => handleDeleteShiftRow(dayKey, slot.id)}
                                variant="danger"
                              >
                                Delete
                              </ActionButton>
                            </td>
                          </tr>
                        ))}

                        {slots.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              style={{
                                ...thTdStyle,
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              No slots for this day.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </PageCard>
            );
          })}

          <PageCard style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ActionButton onClick={handleBackToUpload} variant="secondary">
                Back
              </ActionButton>

              <ActionButton
                onClick={handleSaveWeeklySchedule}
                variant="primary"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Weekly Schedule"}
              </ActionButton>
            </div>
          </PageCard>
        </>
      )}
    </div>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div style={summaryBoxStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

const subTitleStyle = {
  fontSize: 16,
  margin: "0 0 12px",
  color: "#0f172a",
  fontWeight: 800,
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "#475569",
};

const inputStyle = {
  width: "100%",
  maxWidth: 280,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "#ffffff",
  fontSize: 14,
};

const miniInputStyle = {
  minWidth: 110,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#ffffff",
  fontSize: 14,
};

const uploadGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const uploadBoxStyle = {
  border: "1px solid #dbeafe",
  borderRadius: 16,
  padding: 14,
  background: "#f8fbff",
};

const tableWrapStyle = {
  overflowX: "auto",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 760,
  background: "#fff",
};

const theadRowStyle = {
  background: "#f8fbff",
};

const thTdStyle = {
  borderBottom: "1px solid #e2e8f0",
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 14,
};

const selectStyle = {
  minWidth: 180,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#ffffff",
  fontSize: 14,
};

const dayStatsStyle = {
  display: "flex",
  gap: 20,
  fontSize: 14,
  color: "#334155",
  flexWrap: "wrap",
  marginTop: 12,
};

const chipWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const chipStyle = {
  background: "#edf7ff",
  color: "#1769aa",
  border: "1px solid #cfe7fb",
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
};

const emptyTextStyle = {
  fontSize: 14,
  color: "#64748b",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const summaryBoxStyle = {
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  borderRadius: 16,
  padding: "14px 16px",
};

const summaryLabelStyle = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const summaryValueStyle = {
  margin: "8px 0 0",
  fontSize: 22,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.03em",
};
