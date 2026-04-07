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

  const [weeklyRosterFile, setWeeklyRosterFile] = useState(null);

  const [weeklyFlights, setWeeklyFlights] = useState({});
  const [weeklyDemandBlocks, setWeeklyDemandBlocks] = useState({});
  const [weeklySlots, setWeeklySlots] = useState({});
  const [weeklyDraftRosterRows, setWeeklyDraftRosterRows] = useState({});
  const [weeklyDraftSummary, setWeeklyDraftSummary] = useState({});
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
            name:
              emp.name ||
              emp.fullName ||
              emp.employeeName ||
              emp.displayName ||
              emp.username ||
              "Unnamed Employee",
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

  const draftRosterDaysCount = useMemo(() => {
    return DAY_KEYS.filter(
      (day) =>
        Array.isArray(weeklyDraftRosterRows[day]) &&
        weeklyDraftRosterRows[day].length > 0
    ).length;
  }, [weeklyDraftRosterRows]);

  const assignedCount = useMemo(() => {
    return Object.values(weeklySlots)
      .flat()
      .filter((slot) => slot.employeeId && !slot.draftDeleteCandidate).length;
  }, [weeklySlots]);

  const totalSlots = useMemo(() => {
    return Object.values(weeklySlots)
      .flat()
      .filter((slot) => !slot.draftDeleteCandidate).length;
  }, [weeklySlots]);

  const deleteCandidateCount = useMemo(() => {
    return Object.values(weeklySlots)
      .flat()
      .filter((slot) => slot.draftDeleteCandidate).length;
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
      const draftSummaryByDay = {};

      const employeeLookup = buildEmployeeLookup(employees);

      const parsedWeeklyDraftRoster = weeklyRosterFile
        ? await parseWeeklyRosterDraftFile(weeklyRosterFile)
        : createEmptyWeeklyRosterMap();

      for (const dayKey of DAY_KEYS) {
        const file = dayFiles[dayKey];
        const draftRows = parsedWeeklyDraftRoster[dayKey] || [];

        if (!file) {
          if (draftRows.length > 0) {
            const draftOnlyRows = draftRows.map((row, index) => {
              const foundEmployee = findEmployeeMatchByName(
                row.employeeName,
                employeeLookup
              );

              return {
                id: `draft-only-${dayKey}-${index}`,
                dayKey,
                start: row.start || "",
                end: row.end || "",
                role: row.role || "Agent",
                paidHours: calcPaidHours(row.start, row.end),
                calendarHours: calcCalendarHours(row.start, row.end),
                employeeName: foundEmployee?.name || row.employeeName || "",
                employeeId: foundEmployee?.id || "",
                draftDeleteCandidate: true,
                draftSource: true,
                draftMatched: false,
                sourceLabel: "DELETE FROM CURRENT ROSTER",
              };
            });

            slotsByDay[dayKey] = sortSlotsWithDrafts(draftOnlyRows);
            draftSummaryByDay[dayKey] = {
              draftRows: draftRows.length,
              matchedRows: 0,
              deleteCandidates: draftRows.length,
              newGenerated: 0,
            };
          }
          continue;
        }

        const flights = await parseCabinFlights(file);
        const demandBlocks = buildDemandBlocks(flights);
        const generatedSlots = generateCabinShifts(demandBlocks, dayKey) || [];

        const merged = mergeGeneratedSlotsWithDraftRoster({
          dayKey,
          generatedSlots,
          draftRows,
          employeeLookup,
        });

        parsedByDay[dayKey] = flights;
        demandByDay[dayKey] = demandBlocks;
        slotsByDay[dayKey] = sortSlotsWithDrafts(merged.slots);
        draftSummaryByDay[dayKey] = merged.summary;
      }

      setWeeklyFlights(parsedByDay);
      setWeeklyDemandBlocks(demandByDay);
      setWeeklySlots(slotsByDay);
      setWeeklyDraftRosterRows(parsedWeeklyDraftRoster);
      setWeeklyDraftSummary(draftSummaryByDay);
      setStep("assignment");
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          "Error generating weekly schedule. Please verify the flight files and the weekly roster draft file."
      );
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
          if (slot.draftDeleteCandidate) return slot;

          const selectedEmployee = employees.find((emp) => emp.id === employeeId);

          return {
            ...slot,
            employeeId,
            employeeName: selectedEmployee?.name || "",
          };
        }),
      };
    });
  }

  function handleBackToUpload() {
    setStep("upload");
    setWeeklyFlights({});
    setWeeklyDemandBlocks({});
    setWeeklySlots({});
    setWeeklyDraftRosterRows({});
    setWeeklyDraftSummary({});
    setError("");
  }

  async function handleSaveWeeklySchedule() {
    try {
      setSaving(true);

      const cleanWeeklySlots = {};
      Object.entries(weeklySlots).forEach(([dayKey, slots]) => {
        cleanWeeklySlots[dayKey] = (slots || [])
          .filter((slot) => !slot.draftDeleteCandidate)
          .map((slot) => ({
            ...slot,
            draftDeleteCandidate: false,
            draftSource: !!slot.draftSource,
            draftMatched: !!slot.draftMatched,
            sourceLabel: slot.sourceLabel || "",
          }));
      });

      const scheduleId = await saveCabinWeeklySchedule({
        weekStartDate,
        weeklyFlights,
        weeklyDemandBlocks,
        weeklySlots: cleanWeeklySlots,
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
              maxWidth: 860,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Upload daily flight files and one weekly current roster draft, compare
            what stays vs what should be deleted, and save the final weekly staffing plan.
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

                  <div style={miniHelpTextStyle}>
                    {dayFiles[dayKey] ? (
                      <>
                        <b>Uploaded:</b> {dayFiles[dayKey].name}
                      </>
                    ) : (
                      "No flight file uploaded"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <h3 style={subTitleStyle}>Upload Current Weekly Roster Draft</h3>

            <div style={uploadBoxStyle}>
              <div style={miniLabelStyle}>Weekly Roster Draft</div>

              <input
                type="file"
                accept=".csv"
                onChange={(e) => setWeeklyRosterFile(e.target.files?.[0] || null)}
                style={{ fontSize: 13 }}
              />

              <div style={miniHelpTextStyle}>
                {weeklyRosterFile ? (
                  <>
                    <b>Draft uploaded:</b> {weeklyRosterFile.name}
                  </>
                ) : (
                  "Optional weekly roster draft. Supports weekly matrix roster and vertical roster formats."
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={pillBlueStyle}>
              Uploaded flight days: <b>{uploadedDaysCount}/7</b>
            </div>

            <div style={pillSlateStyle}>
              Weekly draft file: <b>{weeklyRosterFile ? "Yes" : "No"}</b>
            </div>

            <div style={pillSlateStyle}>
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
              <SummaryBox label="Draft Days Found" value={`${draftRosterDaysCount}/7`} />
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
              <SummaryBox
                label="Delete Candidates"
                value={String(deleteCandidateCount)}
                tone="red"
              />
            </div>
          </PageCard>

          {DAY_KEYS.map((dayKey) => {
            const flights = weeklyFlights[dayKey] || [];
            const demandBlocks = weeklyDemandBlocks[dayKey] || [];
            const slots = weeklySlots[dayKey] || [];
            const summary = weeklyDraftSummary[dayKey] || {
              draftRows: 0,
              matchedRows: 0,
              deleteCandidates: 0,
              newGenerated: 0,
            };

            if (!flights.length && !slots.length) return null;

            const shiftSummary = summarizeShifts(
              slots.filter((slot) => !slot.draftDeleteCandidate)
            );

            const peakAgents =
              demandBlocks.length > 0
                ? Math.max(...demandBlocks.map((b) => b.recommendedAgents || 0))
                : 0;

            return (
              <PageCard key={dayKey} style={{ padding: 20 }}>
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
                    Slots: <b>{slots.filter((slot) => !slot.draftDeleteCandidate).length}</b>
                  </span>
                  <span>
                    Peak Agents: <b>{peakAgents}</b>
                  </span>
                </div>

                {(summary.draftRows > 0 || summary.deleteCandidates > 0) && (
                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={pillSlateStyle}>
                      Draft rows: <b>{summary.draftRows}</b>
                    </div>
                    <div style={pillGreenStyle}>
                      Matched from draft: <b>{summary.matchedRows}</b>
                    </div>
                    <div style={pillBlueStyle}>
                      New generated: <b>{summary.newGenerated}</b>
                    </div>
                    <div style={pillRedStyle}>
                      Delete from current roster: <b>{summary.deleteCandidates}</b>
                    </div>
                  </div>
                )}

                {summary.deleteCandidates > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 16,
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      color: "#9f1239",
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1.6,
                    }}
                  >
                    Red rows were found in the weekly current roster draft but do not match
                    the new generated schedule for this day. Those rows are marked as delete
                    candidates and will not be saved in the final weekly schedule.
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
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
                  <h3 style={subTitleStyle}>Roster Draft + Assign Employees</h3>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRowStyle}>
                          <th style={thTdStyle}>Source</th>
                          <th style={thTdStyle}>Start</th>
                          <th style={thTdStyle}>End</th>
                          <th style={thTdStyle}>Role</th>
                          <th style={thTdStyle}>Paid Hours</th>
                          <th style={thTdStyle}>Employee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((slot) => {
                          const rowStyle = slot.draftDeleteCandidate
                            ? { background: "#fff1f2" }
                            : slot.draftMatched
                            ? { background: "#ecfdf5" }
                            : {};

                          return (
                            <tr key={`${dayKey}-${slot.id}`} style={rowStyle}>
                              <td style={thTdStyle}>
                                {slot.draftDeleteCandidate ? (
                                  <span style={dangerTagStyle}>DELETE</span>
                                ) : slot.draftMatched ? (
                                  <span style={successTagStyle}>MATCHED DRAFT</span>
                                ) : (
                                  <span style={infoTagStyle}>NEW</span>
                                )}
                              </td>

                              <td style={thTdStyle}>{slot.start || "-"}</td>
                              <td style={thTdStyle}>{slot.end || "-"}</td>
                              <td style={thTdStyle}>{slot.role || "-"}</td>
                              <td style={thTdStyle}>{slot.paidHours ?? "-"}</td>

                              <td style={thTdStyle}>
                                {slot.draftDeleteCandidate ? (
                                  <div style={{ color: "#9f1239", fontWeight: 700 }}>
                                    {slot.employeeName || "Unassigned draft row"}
                                  </div>
                                ) : (
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
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {slots.length === 0 && (
                          <tr>
                            <td colSpan={6} style={thTdStyle}>
                              No shifts found for this day.
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

function SummaryBox({ label, value, tone = "default" }) {
  const tones = {
    default: {
      background: "#f8fbff",
      border: "#dbeafe",
      color: "#0f172a",
    },
    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
    },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.background,
        border: `1px solid ${current.border}`,
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div style={summaryLabelStyle}>{label}</div>
      <div
        style={{
          ...summaryValueStyle,
          color: current.color,
        }}
      >
        {value}
      </div>
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
    if (a.start !== b.start) return String(a.start || "").localeCompare(String(b.start || ""));
    if (a.end !== b.end) return String(a.end || "").localeCompare(String(b.end || ""));
    return String(a.role || "").localeCompare(String(b.role || ""));
  });
}

function buildEmployeeLookup(employees) {
  const map = {};

  (employees || []).forEach((emp) => {
    const name = String(emp?.name || "").trim();
    if (!name) return;

    const variants = buildNameVariants(name);
    variants.forEach((variant) => {
      map[variant] = emp;
    });
  });

  return map;
}

function buildNameVariants(name) {
  const clean = normalizePersonName(name);
  if (!clean) return [];

  const parts = clean.split(" ").filter(Boolean);
  const variants = new Set();

  variants.add(clean);
  variants.add(parts.join(" "));

  if (parts.length >= 2) {
    variants.add([...parts].reverse().join(" "));
  }

  return Array.from(variants);
}

function normalizePersonName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
}

function findEmployeeMatchByName(name, employeeLookup) {
  const variants = buildNameVariants(name);
  for (const variant of variants) {
    if (employeeLookup[variant]) {
      return employeeLookup[variant];
    }
  }
  return null;
}

function createEmptyWeeklyRosterMap() {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

async function parseWeeklyRosterDraftFile(file) {
  const text = await file.text();
  const rows = parseCsvText(text);

  const grouped = createEmptyWeeklyRosterMap();

  const verticalResult = parseVerticalRosterRows(rows);
  const verticalCount = DAY_KEYS.reduce(
    (sum, day) => sum + (verticalResult[day]?.length || 0),
    0
  );

  if (verticalCount > 0) {
    return verticalResult;
  }

  const weeklyResult = parseWeeklyMatrixRosterRows(rows);
  return weeklyResult || grouped;
}

function parseVerticalRosterRows(rows) {
  const grouped = createEmptyWeeklyRosterMap();

  rows.forEach((row, index) => {
    const dayKey = normalizeDayKey(
      getRowValue(row, ["day", "daykey", "weekday", "dow", "dia", "diasemana"])
    );

    if (!dayKey) return;

    const employeeName = getRowValue(row, [
      "employee",
      "employeename",
      "employee_name",
      "name",
      "full_name",
      "fullname",
      "staffname",
      "agent",
      "agentname",
      "workername",
      "lastnamefirstname",
      "firstnamelastname",
    ]);

    const role =
      getRowValue(row, [
        "role",
        "position",
        "job",
        "shiftrole",
        "puesto",
        "cargo",
        "team",
      ]) || "Agent";

    const start = normalizeTimeInput(
      getRowValue(row, [
        "start",
        "starttime",
        "in",
        "shiftstart",
        "timein",
        "horaentrada",
      ])
    );

    const end = normalizeTimeInput(
      getRowValue(row, [
        "end",
        "endtime",
        "out",
        "shiftend",
        "timeout",
        "horasalida",
      ])
    );

    if (!employeeName && !start && !end) return;

    grouped[dayKey].push({
      id: `draft-vertical-${dayKey}-${index}`,
      dayKey,
      employeeName: employeeName || "",
      role,
      start,
      end,
    });
  });

  return grouped;
}

function parseWeeklyMatrixRosterRows(rows) {
  const grouped = createEmptyWeeklyRosterMap();

  let currentRole = "Agent";
  let dayColumns = null;

  rows.forEach((row, index) => {
    const values = Object.values(row || {}).map((v) => String(v || "").trim());
    const upperValues = values.map((v) => v.toUpperCase());

    const monIndex = upperValues.findIndex((v) => v === "MON");
    const tueIndex = upperValues.findIndex((v) => v === "TUE");
    const wedIndex = upperValues.findIndex((v) => v === "WED");
    const thuIndex = upperValues.findIndex((v) => v === "THU");
    const friIndex = upperValues.findIndex((v) => v === "FRI");
    const satIndex = upperValues.findIndex((v) => v === "SAT");
    const sunIndex = upperValues.findIndex((v) => v === "SUN");

    const hasWeekHeader =
      monIndex >= 0 &&
      tueIndex >= 0 &&
      wedIndex >= 0 &&
      thuIndex >= 0 &&
      friIndex >= 0 &&
      satIndex >= 0 &&
      sunIndex >= 0;

    if (hasWeekHeader) {
      const roleCell = values.slice(0, monIndex).reverse().find((v) => v);
      if (roleCell) {
        currentRole = normalizeRosterRole(roleCell);
      }

      dayColumns = {
        monday: monIndex,
        tuesday: tueIndex,
        wednesday: wedIndex,
        thursday: thuIndex,
        friday: friIndex,
        saturday: satIndex,
        sunday: sunIndex,
      };
      return;
    }

    if (!dayColumns) return;

    const isCountRow = DAY_KEYS.every((dayKey) => {
      const cell = values[dayColumns[dayKey]] || "";
      return cell === "" || /^[0-9]+$/.test(cell);
    });

    if (isCountRow) return;

    const candidateBeforeMon = values
      .slice(0, dayColumns.monday)
      .reverse()
      .find((v) => v && !/^\d+(\.\d+)?$/.test(v) && v.toUpperCase() !== "DELTA");

    const employeeName = candidateBeforeMon || "";
    if (!employeeName) return;

    DAY_KEYS.forEach((dayKey) => {
      const rawShift = String(values[dayColumns[dayKey]] || "").trim();
      if (!rawShift || rawShift.toUpperCase() === "OFF") return;

      const { start, end } = splitShiftRange(rawShift);

      grouped[dayKey].push({
        id: `draft-weekly-${dayKey}-${index}-${employeeName}`,
        dayKey,
        employeeName,
        role: currentRole || "Agent",
        start,
        end,
      });
    });
  });

  return grouped;
}

function normalizeRosterRole(value) {
  const clean = String(value || "").trim().toUpperCase();

  if (clean.includes("SUPERVISOR")) return "Supervisor";
  if (clean.includes("LAV")) return "LAV";
  return "Agent";
}

function splitShiftRange(value) {
  const clean = String(value || "").trim().toUpperCase();

  if (!clean || clean === "OFF") {
    return { start: "", end: "" };
  }

  const match = clean.match(
    /^(\d{3,4}|\d{1,2}:\d{2})\s*-\s*(\d{3,4}|\d{1,2}:\d{2})$/
  );

  if (!match) {
    return { start: "", end: "" };
  }

  return {
    start: normalizeTimeInput(match[1]),
    end: normalizeTimeInput(match[2]),
  };
}

function normalizeDayKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw === "monday" || raw === "mon") return "monday";
  if (raw === "tuesday" || raw === "tue" || raw === "tues") return "tuesday";
  if (raw === "wednesday" || raw === "wed") return "wednesday";
  if (raw === "thursday" || raw === "thu" || raw === "thur" || raw === "thurs")
    return "thursday";
  if (raw === "friday" || raw === "fri") return "friday";
  if (raw === "saturday" || raw === "sat") return "saturday";
  if (raw === "sunday" || raw === "sun") return "sunday";

  return "";
}

function mergeGeneratedSlotsWithDraftRoster({
  dayKey,
  generatedSlots,
  draftRows,
  employeeLookup,
}) {
  const nextSlots = [];
  const usedDraftIndexes = new Set();

  (generatedSlots || []).forEach((slot, slotIndex) => {
    const matchingDraftIndex = draftRows.findIndex((draftRow, idx) => {
      if (usedDraftIndexes.has(idx)) return false;

      return (
        normalizeTimeInput(draftRow.start) === normalizeTimeInput(slot.start) &&
        normalizeTimeInput(draftRow.end) === normalizeTimeInput(slot.end) &&
        normalizeRole(draftRow.role) === normalizeRole(slot.role)
      );
    });

    if (matchingDraftIndex >= 0) {
      usedDraftIndexes.add(matchingDraftIndex);
      const matchedDraft = draftRows[matchingDraftIndex];
      const foundEmployee = findEmployeeMatchByName(
        matchedDraft.employeeName,
        employeeLookup
      );

      nextSlots.push({
        ...slot,
        id: slot.id || `${dayKey}-generated-${slotIndex}`,
        employeeName: foundEmployee?.name || matchedDraft.employeeName || "",
        employeeId: foundEmployee?.id || "",
        draftSource: true,
        draftMatched: true,
        draftDeleteCandidate: false,
        sourceLabel: "MATCHED DRAFT",
      });
    } else {
      nextSlots.push({
        ...slot,
        id: slot.id || `${dayKey}-generated-${slotIndex}`,
        draftSource: false,
        draftMatched: false,
        draftDeleteCandidate: false,
        sourceLabel: "NEW",
      });
    }
  });

  const deleteCandidates = draftRows
    .map((draftRow, idx) => ({ draftRow, idx }))
    .filter(({ idx }) => !usedDraftIndexes.has(idx))
    .map(({ draftRow, idx }) => {
      const foundEmployee = findEmployeeMatchByName(
        draftRow.employeeName,
        employeeLookup
      );

      return {
        id: `delete-${dayKey}-${idx}`,
        dayKey,
        start: draftRow.start || "",
        end: draftRow.end || "",
        role: draftRow.role || "Agent",
        paidHours: calcPaidHours(draftRow.start, draftRow.end),
        calendarHours: calcCalendarHours(draftRow.start, draftRow.end),
        employeeName: foundEmployee?.name || draftRow.employeeName || "",
        employeeId: foundEmployee?.id || "",
        draftSource: true,
        draftMatched: false,
        draftDeleteCandidate: true,
        sourceLabel: "DELETE FROM CURRENT ROSTER",
      };
    });

  return {
    slots: [...nextSlots, ...deleteCandidates],
    summary: {
      draftRows: draftRows.length,
      matchedRows: usedDraftIndexes.size,
      deleteCandidates: deleteCandidates.length,
      newGenerated: nextSlots.filter((slot) => !slot.draftMatched).length,
    },
  };
}

function sortSlotsWithDrafts(slots) {
  return [...(slots || [])].sort((a, b) => {
    if (!!a.draftDeleteCandidate !== !!b.draftDeleteCandidate) {
      return a.draftDeleteCandidate ? 1 : -1;
    }

    if ((a.start || "") !== (b.start || "")) {
      return (a.start || "").localeCompare(b.start || "");
    }

    if ((a.end || "") !== (b.end || "")) {
      return (a.end || "").localeCompare(b.end || "");
    }

    return (a.role || "").localeCompare(b.role || "");
  });
}

function parseCsvText(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => normalizeHeader(h));

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = String(values[index] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function getRowValue(row, possibleKeys) {
  for (const key of possibleKeys) {
    const normalized = normalizeHeader(key);
    if (row[normalized] !== undefined && row[normalized] !== null) {
      return String(row[normalized]).trim();
    }
  }
  return "";
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTimeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":");
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  if (/^\d{3,4}$/.test(raw)) {
    const clean = raw.padStart(4, "0");
    return `${clean.slice(0, 2)}:${clean.slice(2)}`;
  }

  const ampm = raw.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = String(ampm[2] || "00").padStart(2, "0");
    const meridian = ampm[3].toLowerCase();

    if (meridian === "pm" && hour < 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  return raw;
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

const uploadGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
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
  minWidth: 860,
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
  minWidth: 200,
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

const miniLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1769aa",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const miniHelpTextStyle = {
  marginTop: 8,
  fontSize: 12,
  color: "#475569",
  lineHeight: 1.5,
};

const pillBlueStyle = {
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
};

const pillSlateStyle = {
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
};

const pillGreenStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  color: "#166534",
  fontWeight: 700,
};

const pillRedStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  color: "#9f1239",
  fontWeight: 700,
};

const infoTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "#edf7ff",
  color: "#1769aa",
  border: "1px solid #cfe7fb",
};

const successTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #a7f3d0",
};

const dangerTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "#fff1f2",
  color: "#9f1239",
  border: "1px solid #fecdd3",
};
