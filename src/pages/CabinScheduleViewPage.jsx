import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  bulkUpdateCabinSlots,
  deleteCabinSchedule,
  deleteCabinSlot,
  deleteManyCabinSlots,
} from "../services/cabinScheduleEditService.js";
import { exportCabinSchedulePdf } from "../utils/exportCabinSchedulePdf.js";

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

const DAY_SHORT_LABELS = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

const ROLE_OPTIONS = ["Supervisor", "LAV", "Agent"];

export default function CabinScheduleViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(null);
  const [slotsByDay, setSlotsByDay] = useState({});
  const [flightsByDay, setFlightsByDay] = useState({});
  const [demandByDay, setDemandByDay] = useState({});
  const [employees, setEmployees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("detail");
  const [editMode, setEditMode] = useState(false);

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

        const [slotsSnap, flightsSnap, demandSnap, employeesSnap] = await Promise.all([
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
          getDocs(collection(db, "employees")),
        ]);

        const slots = slotsSnap.docs.map((d) => ({
          ...d.data(),
          firestoreId: d.id,
        }));

        const flights = flightsSnap.docs.map((d) => ({
          ...d.data(),
          firestoreId: d.id,
        }));

        const demandBlocks = demandSnap.docs.map((d) => ({
          ...d.data(),
          firestoreId: d.id,
        }));

        const employeeList = employeesSnap.docs
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
              emp.username ||
              "Unnamed Employee",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setEmployees(employeeList);
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
    () =>
      Object.values(flightsByDay).reduce((sum, items) => sum + items.length, 0),
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

  const currentSlotsSignature = useMemo(
    () =>
      JSON.stringify(
        Object.values(slotsByDay).flat().map(minifySlotForCompare)
      ),
    [slotsByDay]
  );

  const [baselineSignature, setBaselineSignature] = useState("");

  useEffect(() => {
    if (!loading) {
      setBaselineSignature(currentSlotsSignature);
    }
  }, [loading, currentSlotsSignature]);

  const hasUnsavedChanges = baselineSignature !== currentSlotsSignature;

  function handleSlotFieldChange(dayKey, slotId, field, value) {
    setSlotsByDay((prev) => {
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

  function handleCancelEdit() {
    window.location.reload();
  }

  async function handleSaveChanges() {
    try {
      setSaving(true);

      const allSlots = Object.values(slotsByDay).flat();

      const updates = allSlots
        .filter((slot) => slot.firestoreId)
        .map((slot) => ({
          id: slot.firestoreId,
          updates: {
            start: slot.start || "",
            end: slot.end || "",
            role: slot.role || "",
            employeeId: slot.employeeId || "",
            employeeName: slot.employeeName || "",
            status: slot.employeeId || slot.employeeName ? "assigned" : "open",
            calendarHours: calcCalendarHours(slot.start, slot.end),
            paidHours: calcPaidHours(slot.start, slot.end),
          },
        }));

      await bulkUpdateCabinSlots(updates);
      setBaselineSignature(JSON.stringify(allSlots.map(minifySlotForCompare)));
      setEditMode(false);
      alert("Changes saved successfully.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error saving changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSlot(dayKey, firestoreId) {
    const confirmed = window.confirm("Delete this shift?");
    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteCabinSlot(firestoreId);

      setSlotsByDay((prev) => ({
        ...prev,
        [dayKey]: (prev[dayKey] || []).filter(
          (slot) => slot.firestoreId !== firestoreId
        ),
      }));
    } catch (err) {
      console.error(err);
      alert(err.message || "Error deleting slot.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSchedule() {
    const confirmed = window.confirm(
      "Delete this entire Cabin schedule? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteCabinSchedule(id);
      alert("Schedule deleted successfully.");
      navigate("/cabin-saved-schedules");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error deleting schedule.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteRosterRow(groupName, employeeName) {
    const confirmed = window.confirm(
      `Delete all shifts for ${employeeName} in ${groupName}?`
    );
    if (!confirmed) return;

    try {
      setDeleting(true);

      const slotIdsToDelete = [];

      Object.values(slotsByDay)
        .flat()
        .forEach((slot) => {
          const slotGroup = getShiftGroup(slot);
          const slotEmployee = slot.employeeName || slot.employeeId || "Open";

          if (
            slotGroup === groupName &&
            slotEmployee === employeeName &&
            slot.firestoreId
          ) {
            slotIdsToDelete.push(slot.firestoreId);
          }
        });

      if (!slotIdsToDelete.length) {
        setDeleting(false);
        return;
      }

      await deleteManyCabinSlots(slotIdsToDelete);

      setSlotsByDay((prev) => {
        const next = {};
        Object.entries(prev).forEach(([dayKey, slots]) => {
          next[dayKey] = slots.filter(
            (slot) => !slotIdsToDelete.includes(slot.firestoreId)
          );
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Error deleting row.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExportPdf() {
    try {
      setExporting(true);

      const safeWeek = schedule?.weekStartDate || "week";
      const fileName =
        viewMode === "roster"
          ? `cabin-roster-${safeWeek}.pdf`
          : `cabin-detail-${safeWeek}.pdf`;

      await exportCabinSchedulePdf({
        elementId:
          viewMode === "roster"
            ? "cabin-roster-export"
            : "cabin-detail-export",
        fileName,
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Error exporting PDF.");
    } finally {
      setExporting(false);
    }
  }

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
          <p style={pageSubStyle}>Weekly Cabin Service schedule details</p>
        </div>

        <div style={headerActionsStyle}>
          <button
            type="button"
            onClick={handleExportPdf}
            style={exportButtonStyle}
            disabled={exporting || editMode}
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>

          <button
            type="button"
            onClick={handleDeleteSchedule}
            style={deleteScheduleButtonStyle}
            disabled={deleting || saving}
          >
            {deleting ? "Deleting..." : "Delete Schedule"}
          </button>

          <Link to="/cabin-saved-schedules" style={backButtonStyle}>
            Back to Saved Schedules
          </Link>
        </div>
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

      <div style={cardStyle}>
        <div style={toolbarWrapStyle}>
          <div style={viewToggleWrapStyle}>
            <button
              type="button"
              onClick={() => setViewMode("detail")}
              style={
                viewMode === "detail"
                  ? toggleButtonActiveStyle
                  : toggleButtonStyle
              }
            >
              Detail View
            </button>

            <button
              type="button"
              onClick={() => setViewMode("roster")}
              style={
                viewMode === "roster"
                  ? toggleButtonActiveStyle
                  : toggleButtonStyle
              }
            >
              Roster View
            </button>
          </div>

          <div style={editActionsWrapStyle}>
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                style={actionButtonStyle}
              >
                Edit Mode
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  style={saveButtonStyle}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={cancelButtonStyle}
                  disabled={saving}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {editMode && (
          <div style={editModeBannerStyle}>
            Edit Mode is ON. You can change employee, start time, end time, and
            role directly in the table.
          </div>
        )}

        {hasUnsavedChanges && editMode && (
          <div style={pendingBannerStyle}>You have unsaved changes.</div>
        )}

        {editMode && (
          <div style={exportHintStyle}>
            Disable Edit Mode before exporting the PDF.
          </div>
        )}
      </div>

      <div style={{ height: 16 }} />

      {viewMode === "roster" ? (
        <div id="cabin-roster-export">
          <CabinRosterWeeklyView
            slotsByDay={slotsByDay}
            editMode={editMode}
            deleting={deleting}
            onDeleteRow={handleDeleteRosterRow}
            weekStartDate={schedule?.weekStartDate}
          />
        </div>
      ) : (
        <div id="cabin-detail-export">
          {DAY_KEYS.map((dayKey) => {
            const slots = slotsByDay[dayKey] || [];
            const flights = flightsByDay[dayKey] || [];
            const demandBlocks = demandByDay[dayKey] || [];

            if (!slots.length && !flights.length && !demandBlocks.length) {
              return null;
            }

            const arrivals = flights.filter(
              (f) => f.movementType === "arrival"
            ).length;
            const departures = flights.filter(
              (f) => f.movementType !== "arrival"
            ).length;
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
                            {editMode && <th style={thTdStyle}>Delete</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((slot) => (
                            <tr key={slot.id || slot.firestoreId}>
                              <td style={thTdStyle}>
                                {editMode ? (
                                  <input
                                    type="time"
                                    value={slot.start || ""}
                                    onChange={(e) =>
                                      handleSlotFieldChange(
                                        dayKey,
                                        slot.id,
                                        "start",
                                        e.target.value
                                      )
                                    }
                                    style={timeInputStyle}
                                  />
                                ) : (
                                  slot.start || "-"
                                )}
                              </td>

                              <td style={thTdStyle}>
                                {editMode ? (
                                  <input
                                    type="time"
                                    value={slot.end || ""}
                                    onChange={(e) =>
                                      handleSlotFieldChange(
                                        dayKey,
                                        slot.id,
                                        "end",
                                        e.target.value
                                      )
                                    }
                                    style={timeInputStyle}
                                  />
                                ) : (
                                  slot.end || "-"
                                )}
                              </td>

                              <td style={thTdStyle}>
                                {editMode ? (
                                  <select
                                    value={slot.role || ""}
                                    onChange={(e) =>
                                      handleSlotFieldChange(
                                        dayKey,
                                        slot.id,
                                        "role",
                                        e.target.value
                                      )
                                    }
                                    style={selectStyle}
                                  >
                                    {ROLE_OPTIONS.map((role) => (
                                      <option key={role} value={role}>
                                        {role}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  slot.role || "-"
                                )}
                              </td>

                              <td style={thTdStyle}>{slot.paidHours ?? "-"}</td>

                              <td style={thTdStyle}>
                                {editMode ? (
                                  <select
                                    value={slot.employeeId || ""}
                                    onChange={(e) =>
                                      handleSlotFieldChange(
                                        dayKey,
                                        slot.id,
                                        "employeeId",
                                        e.target.value
                                      )
                                    }
                                    style={selectStyle}
                                  >
                                    <option value="">Open</option>
                                    {employees.map((emp) => (
                                      <option key={emp.id} value={emp.id}>
                                        {emp.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  slot.employeeName || slot.employeeId || "Open"
                                )}
                              </td>

                              <td style={thTdStyle}>
                                <span
                                  style={
                                    slot.employeeId || slot.employeeName
                                      ? assignedChipStyle
                                      : openChipStyle
                                  }
                                >
                                  {slot.employeeId || slot.employeeName
                                    ? "Assigned"
                                    : "Open"}
                                </span>
                              </td>

                              {editMode && (
                                <td style={thTdStyle}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteSlot(dayKey, slot.firestoreId)
                                    }
                                    style={deleteSlotButtonStyle}
                                    disabled={deleting}
                                  >
                                    Delete
                                  </button>
                                </td>
                              )}
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
                            <tr key={flight.firestoreId || flight.id}>
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
      )}
    </div>
  );
}

function CabinRosterWeeklyView({
  slotsByDay,
  editMode,
  deleting,
  onDeleteRow,
  weekStartDate,
}) {
  const groupedRoster = useMemo(() => buildRosterGroups(slotsByDay), [slotsByDay]);

  const orderedGroups = [
    "SUPERVISOR",
    "LAV",
    "TEAM 1",
    "TEAM 2",
    "TEAM 3",
    "NIGHT SHIFT",
  ];

  return (
    <div style={rosterExportWrapStyle}>
      <div style={rosterTopHeaderStyle}>
        <div style={rosterTopTitleStyle}>CABIN SERVICE WEEKLY SCHEDULE</div>
        <div style={rosterTopSubTitleStyle}>Week Start: {weekStartDate || "-"}</div>
      </div>

      {orderedGroups.map((groupName) => {
        const employees = groupedRoster[groupName] || [];
        if (!employees.length) return null;

        return (
          <div key={groupName} style={rosterSectionWrapStyle}>
            <div style={rosterSectionHeaderStyle}>{groupName}</div>

            <div style={{ overflowX: "auto" }}>
              <table style={rosterTableStyle}>
                <thead>
                  <tr>
                    <th
                      style={{
                        ...rosterHeaderCellStyle,
                        ...rosterEmployeeHeaderStyle,
                      }}
                    >
                      EMPLOYEE
                    </th>
                    {DAY_KEYS.map((dayKey) => (
                      <th key={dayKey} style={rosterHeaderCellStyle}>
                        {DAY_SHORT_LABELS[dayKey]}
                      </th>
                    ))}
                    {editMode && <th style={rosterHeaderCellStyle}>DELETE</th>}
                  </tr>
                </thead>

                <tbody>
                  {employees.map((employee, index) => (
                    <tr key={`${groupName}-${employee.name}-${index}`}>
                      <td style={rosterNameCellStyle}>{employee.name}</td>

                      {DAY_KEYS.map((dayKey) => {
                        const value = employee.days[dayKey] || "OFF";
                        const isOff = value === "OFF";

                        return (
                          <td
                            key={dayKey}
                            style={{
                              ...rosterCellStyle,
                              ...(isOff ? rosterOffCellStyle : {}),
                            }}
                          >
                            {value}
                          </td>
                        );
                      })}

                      {editMode && (
                        <td style={rosterCellStyle}>
                          <button
                            type="button"
                            onClick={() => onDeleteRow(groupName, employee.name)}
                            style={deleteRowButtonStyle}
                            disabled={deleting}
                          >
                            Delete Row
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildRosterGroups(slotsByDay) {
  const grouped = {};

  Object.entries(slotsByDay || {}).forEach(([dayKey, slots]) => {
    slots.forEach((slot) => {
      const employeeName = slot.employeeName || slot.employeeId || "Open";
      const groupName = getShiftGroup(slot);
      const shiftLabel = buildShiftLabel(slot);

      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }

      let employeeRow = grouped[groupName].find((item) => item.name === employeeName);

      if (!employeeRow) {
        employeeRow = {
          name: employeeName,
          days: {},
        };
        grouped[groupName].push(employeeRow);
      }

      employeeRow.days[dayKey] = shiftLabel;
    });
  });

  Object.keys(grouped).forEach((groupName) => {
    grouped[groupName] = grouped[groupName].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  });

  return grouped;
}

function getShiftGroup(slot) {
  const start = normalizeTimeForCompare(slot.start || "");
  const role = slot.role || "";

  if (role === "Supervisor") return "SUPERVISOR";
  if (role === "LAV") return "LAV";

  if (start >= "04:00" && start < "07:00") return "TEAM 1";
  if (start >= "07:00" && start < "11:00") return "TEAM 2";
  if (start >= "11:00" && start < "15:00") return "TEAM 3";
  return "NIGHT SHIFT";
}

function buildShiftLabel(slot) {
  const start = compactTime(slot.start || "");
  const end = compactTime(slot.end || "");

  if (!start || !end) return "SHIFT";
  return `${start}-${end}`;
}

function compactTime(timeValue) {
  if (!timeValue || !String(timeValue).includes(":")) return String(timeValue || "");
  const [hh, mm] = String(timeValue).split(":");
  return `${hh}${mm}`;
}

function normalizeTimeForCompare(value) {
  if (!value) return "";
  const str = String(value);
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  return str;
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

function minifySlotForCompare(slot) {
  return {
    firestoreId: slot.firestoreId || "",
    id: slot.id || "",
    start: slot.start || "",
    end: slot.end || "",
    role: slot.role || "",
    employeeId: slot.employeeId || "",
    employeeName: slot.employeeName || "",
  };
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

const headerActionsStyle = {
  display: "flex",
  gap: 10,
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

const exportButtonStyle = {
  background: "#7c3aed",
  color: "#ffffff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const deleteScheduleButtonStyle = {
  background: "#b91c1c",
  color: "#ffffff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const deleteSlotButtonStyle = {
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "6px 10px",
  border: "1px solid #fecaca",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const deleteRowButtonStyle = {
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "4px 8px",
  border: "1px solid #fecaca",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 11,
};

const linkStyle = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
};

const toolbarWrapStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const viewToggleWrapStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const editActionsWrapStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const toggleButtonStyle = {
  background: "#e5e7eb",
  color: "#111827",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const toggleButtonActiveStyle = {
  ...toggleButtonStyle,
  background: "#1d4ed8",
  color: "#ffffff",
};

const actionButtonStyle = {
  background: "#0f172a",
  color: "#ffffff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const saveButtonStyle = {
  background: "#047857",
  color: "#ffffff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const cancelButtonStyle = {
  background: "#e5e7eb",
  color: "#111827",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const editModeBannerStyle = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 14,
  fontWeight: 600,
};

const pendingBannerStyle = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#fef3c7",
  color: "#92400e",
  fontSize: 14,
  fontWeight: 600,
};

const exportHintStyle = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 13,
};

const rosterExportWrapStyle = {
  background: "#ffffff",
  padding: 12,
  borderRadius: 10,
};

const rosterTopHeaderStyle = {
  marginBottom: 14,
  border: "2px solid #1d4ed8",
  borderRadius: 8,
  overflow: "hidden",
};

const rosterTopTitleStyle = {
  background: "#1d4ed8",
  color: "#ffffff",
  textAlign: "center",
  fontSize: 20,
  fontWeight: 800,
  padding: "10px 12px",
  letterSpacing: "0.04em",
};

const rosterTopSubTitleStyle = {
  background: "#eff6ff",
  color: "#0f172a",
  textAlign: "center",
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 12px",
  borderTop: "1px solid #bfdbfe",
};

const rosterSectionWrapStyle = {
  marginBottom: 18,
};

const rosterSectionHeaderStyle = {
  background: "#1d4ed8",
  color: "#ffffff",
  padding: "8px 12px",
  fontWeight: 800,
  fontSize: 15,
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  letterSpacing: "0.02em",
};

const rosterTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "#ffffff",
};

const rosterHeaderCellStyle = {
  border: "2px solid #1e293b",
  padding: "8px 6px",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 800,
  background: "#1d4ed8",
  color: "#ffffff",
};

const rosterEmployeeHeaderStyle = {
  width: 220,
};

const rosterCellStyle = {
  border: "1px solid #1e293b",
  padding: "7px 6px",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 600,
  background: "#ffffff",
  color: "#111827",
};

const rosterNameCellStyle = {
  ...rosterCellStyle,
  textAlign: "left",
  fontWeight: 700,
  paddingLeft: 10,
  width: 220,
};

const rosterOffCellStyle = {
  background: "#e5e7eb",
  color: "#374151",
  fontWeight: 700,
};

const selectStyle = {
  minWidth: 160,
  padding: "6px 8px",
};

const timeInputStyle = {
  minWidth: 110,
  padding: "6px 8px",
};
