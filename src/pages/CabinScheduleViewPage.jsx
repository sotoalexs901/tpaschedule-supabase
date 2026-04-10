import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  addDoc,
  serverTimestamp,
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

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
      boxShadow: "none",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
      boxShadow: "none",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
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
        opacity: disabled ? 0.6 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
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

  if (s === "rejected" || s === "returned") {
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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLookup(value) {
  return normalizeText(value).toLowerCase();
}

function prettifyCodeName(value) {
  const clean = normalizeText(value);
  if (!clean) return "Open";

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

function resolveCreatedByName(schedule, employeeMap) {
  const possibleValues = [
    schedule?.createdByName,
    schedule?.createdByDisplayName,
    schedule?.createdByFullName,
    schedule?.createdBy,
    schedule?.createdByUsername,
    schedule?.createdByUserName,
    schedule?.createdByEmail,
    schedule?.submittedBy,
    schedule?.savedBy,
  ].filter(Boolean);

  for (const value of possibleValues) {
    const direct = normalizeText(value);
    const lookup = normalizeLookup(value);

    if (!direct) continue;

    if (
      direct.includes(" ") &&
      !direct.includes("_") &&
      !direct.includes(".") &&
      !/@/.test(direct)
    ) {
      return direct;
    }

    if (employeeMap[lookup]) {
      return employeeMap[lookup];
    }
  }

  return prettifyCodeName(possibleValues[0] || "-");
}

function resolveSlotEmployeeName(slot, employeeMap) {
  const directName = normalizeText(slot?.employeeName);
  const employeeId = normalizeText(slot?.employeeId);

  if (directName && directName.toLowerCase() !== "open") {
    const lookupFromName = employeeMap[normalizeLookup(directName)];
    if (lookupFromName) return lookupFromName;
    return prettifyCodeName(directName);
  }

  if (employeeId) {
    const lookupFromId = employeeMap[normalizeLookup(employeeId)];
    if (lookupFromId) return lookupFromId;
    return prettifyCodeName(employeeId);
  }

  return "";
}

function getSlotSourceType(slot) {
  if (slot?.draftDeleteCandidate) return "delete";
  if (slot?.draftMatched || slot?.draftSource) return "draft";
  return "generated";
}

function getSlotSourceLabel(slot) {
  if (slot?.draftDeleteCandidate) {
    return slot?.sourceLabel || "Delete from current roster";
  }
  if (slot?.draftMatched || slot?.draftSource) {
    return slot?.sourceLabel || "Came from weekly draft";
  }
  return slot?.sourceLabel || "New generated";
}

function getSlotSourceStyle(slot) {
  const type = getSlotSourceType(slot);

  if (type === "delete") {
    return {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    };
  }

  if (type === "draft") {
    return {
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #a7f3d0",
    };
  }

  return {
    background: "#edf7ff",
    color: "#1769aa",
    border: "1px solid #cfe7fb",
  };
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

export default function CabinScheduleViewPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();

  const scheduleId = useMemo(() => {
    const queryId = new URLSearchParams(location.search).get("id");

    return (
      params?.id ||
      params?.scheduleId ||
      params?.docId ||
      location.state?.id ||
      location.state?.scheduleId ||
      location.state?.docId ||
      queryId ||
      ""
    );
  }, [params, location.search, location.state]);

  const [schedule, setSchedule] = useState(null);
  const [slotsByDay, setSlotsByDay] = useState({});
  const [flightsByDay, setFlightsByDay] = useState({});
  const [demandByDay, setDemandByDay] = useState({});
  const [employees, setEmployees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addingDayKey, setAddingDayKey] = useState("");
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("detail");
  const [editMode, setEditMode] = useState(false);

  const employeeMap = useMemo(() => {
    const map = {};

    employees.forEach((emp) => {
      const visibleName = getEmployeeVisibleName(emp);

      [
        emp?.id,
        emp?.username,
        emp?.loginUsername,
        emp?.email,
        emp?.displayName,
        emp?.fullName,
        emp?.name,
        emp?.employeeName,
      ]
        .map((value) => normalizeLookup(value))
        .filter(Boolean)
        .forEach((key) => {
          map[key] = visibleName;
        });
    });

    return map;
  }, [employees]);

  useEffect(() => {
    async function loadScheduleView() {
      try {
        setLoading(true);
        setError("");

        if (!scheduleId) {
          throw new Error("Missing cabin schedule ID.");
        }

        const scheduleRef = doc(db, "cabinSchedules", scheduleId);
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
              where("scheduleId", "==", scheduleId)
            )
          ),
          getDocs(
            query(
              collection(db, "cabinScheduleFlights"),
              where("scheduleId", "==", scheduleId)
            )
          ),
          getDocs(
            query(
              collection(db, "cabinScheduleDemandBlocks"),
              where("scheduleId", "==", scheduleId)
            )
          ),
          getDocs(collection(db, "employees")),
        ]);

        const employeeList = employeesSnap.docs
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

        const tempEmployeeMap = {};
        employeeList.forEach((emp) => {
          [
            emp?.id,
            emp?.username,
            emp?.loginUsername,
            emp?.email,
            emp?.displayName,
            emp?.fullName,
            emp?.name,
            emp?.employeeName,
          ]
            .map((value) => normalizeLookup(value))
            .filter(Boolean)
            .forEach((key) => {
              tempEmployeeMap[key] = emp.name;
            });
        });

        const slots = slotsSnap.docs.map((d) => {
          const raw = d.data() || {};
          const resolvedName = resolveSlotEmployeeName(raw, tempEmployeeMap);

          return {
            ...raw,
            firestoreId: d.id,
            id: raw.id || d.id,
            employeeName: resolvedName,
            status: raw?.draftDeleteCandidate
              ? "delete_candidate"
              : resolvedName || raw.employeeId
              ? "assigned"
              : "open",
          };
        });

        const flights = flightsSnap.docs.map((d) => ({
          ...(d.data() || {}),
          firestoreId: d.id,
        }));

        const demandBlocks = demandSnap.docs.map((d) => ({
          ...(d.data() || {}),
          firestoreId: d.id,
        }));

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

    loadScheduleView();
  }, [scheduleId]);

  const resolvedCreatedBy = useMemo(() => {
    if (!schedule) return "-";
    return resolveCreatedByName(schedule, employeeMap);
  }, [schedule, employeeMap]);

  const totalFlights = useMemo(
    () =>
      Object.values(flightsByDay).reduce(
        (sum, items) => sum + (items?.length || 0),
        0
      ),
    [flightsByDay]
  );

  const totalSlots = useMemo(
    () =>
      Object.values(slotsByDay).reduce(
        (sum, items) => sum + (items?.length || 0),
        0
      ),
    [slotsByDay]
  );

  const assignedSlots = useMemo(
    () =>
      Object.values(slotsByDay)
        .flat()
        .filter(
          (slot) =>
            !slot.draftDeleteCandidate && (slot.employeeId || slot.employeeName)
        ).length,
    [slotsByDay]
  );

  const currentSlotsSignature = useMemo(
    () => JSON.stringify(Object.values(slotsByDay).flat().map(minifySlotForCompare)),
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
          if (slot.draftDeleteCandidate) return slot;

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

  function handleCancelEdit() {
    window.location.reload();
  }

  async function handleSaveChanges() {
    try {
      setSaving(true);

      const allSlots = Object.values(slotsByDay).flat();

      const updates = allSlots
        .filter((slot) => slot.firestoreId && !slot.draftDeleteCandidate)
        .map((slot) => ({
          id: slot.firestoreId,
          updates: {
            start: slot.start || "",
            end: slot.end || "",
            role: slot.role || "",
            employeeId: slot.employeeId || "",
            employeeName: slot.employeeId
              ? prettifyCodeName(slot.employeeName || "")
              : "",
            status: slot.employeeId || slot.employeeName ? "assigned" : "open",
            calendarHours: calcCalendarHours(slot.start, slot.end),
            paidHours: calcPaidHours(slot.start, slot.end),
            draftSource: !!slot.draftSource,
            draftMatched: !!slot.draftMatched,
            draftDeleteCandidate: false,
            sourceLabel: slot.sourceLabel || "",
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

  async function handleAddShiftRow(dayKey) {
    try {
      setAddingDayKey(dayKey);

      const payload = {
        scheduleId: scheduleId,
        dayKey,
        start: "",
        end: "",
        role: "Agent",
        employeeId: "",
        employeeName: "",
        status: "open",
        calendarHours: 0,
        paidHours: 0,
        draftSource: false,
        draftMatched: false,
        draftDeleteCandidate: false,
        sourceLabel: "New generated",
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "cabinScheduleSlots"), payload);

      const newSlot = {
        ...payload,
        firestoreId: ref.id,
        id: ref.id,
      };

      setSlotsByDay((prev) => {
        const nextDaySlots = [...(prev[dayKey] || []), newSlot].sort(sortSlots);
        return {
          ...prev,
          [dayKey]: nextDaySlots,
        };
      });
    } catch (err) {
      console.error(err);
      alert(err.message || "Error adding shift row.");
    } finally {
      setAddingDayKey("");
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
      await deleteCabinSchedule(scheduleId);
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
          if (slot.draftDeleteCandidate) return;

          const slotGroup = getShiftGroup(slot);
          const slotEmployee = prettifyCodeName(
            slot.employeeName || slot.employeeId || "Open"
          );

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
          next[dayKey] = (slots || []).filter(
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
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading cabin schedule...
        </p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <PageCard style={{ padding: 18 }}>
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
        </PageCard>

        <div>
          <Link
            to="/cabin-saved-schedules"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 12,
              background: "#edf7ff",
              color: "#1769aa",
              border: "1px solid #cfe7fb",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Back to Cabin Saved Schedules
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 16 : isTablet ? 20 : 24,
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
          <div style={{ minWidth: 0 }}>
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
                fontSize: isMobile ? 26 : 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Cabin Schedule View
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Weekly Cabin Service schedule details, assignments, flights and
              editable roster view.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <ActionButton
              onClick={handleExportPdf}
              variant="secondary"
              disabled={exporting || editMode}
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </ActionButton>

            <ActionButton
              onClick={handleDeleteSchedule}
              variant="danger"
              disabled={deleting || saving}
            >
              {deleting ? "Deleting..." : "Delete Schedule"}
            </ActionButton>

            <Link
              to="/cabin-saved-schedules"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.18)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.25)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Back to Saved Schedules
            </Link>
          </div>
        </div>
      </div>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div style={summaryGridStyle}>
          <SummaryBox label="Week Start" value={schedule?.weekStartDate || "-"} />
          <SummaryBox label="Created By" value={resolvedCreatedBy} />
          <SummaryBox
            label="Status"
            value={
              <span style={statusBadge(schedule?.status)}>
                {schedule?.status || "draft"}
              </span>
            }
          />
          <SummaryBox label="Flights" value={String(totalFlights)} />
          <SummaryBox label="Slots" value={String(totalSlots)} />
          <SummaryBox label="Assigned" value={`${assignedSlots}/${totalSlots}`} />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton
              onClick={() => setViewMode("detail")}
              variant={viewMode === "detail" ? "primary" : "secondary"}
            >
              Detail View
            </ActionButton>

            <ActionButton
              onClick={() => setViewMode("roster")}
              variant={viewMode === "roster" ? "primary" : "secondary"}
            >
              Roster View
            </ActionButton>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!editMode ? (
              <ActionButton onClick={() => setEditMode(true)} variant="dark">
                Edit Mode
              </ActionButton>
            ) : (
              <>
                <ActionButton
                  onClick={handleSaveChanges}
                  variant="success"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </ActionButton>

                <ActionButton
                  onClick={handleCancelEdit}
                  variant="secondary"
                  disabled={saving}
                >
                  Cancel
                </ActionButton>
              </>
            )}
          </div>
        </div>

        {editMode && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 16,
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Edit Mode is ON. You can change employee, start time, end time, role,
            and add new shift rows directly in each day section.
          </div>
        )}

        {hasUnsavedChanges && editMode && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            You have unsaved changes.
          </div>
        )}

        {editMode && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#475569",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Disable Edit Mode before exporting the PDF.
          </div>
        )}
      </PageCard>

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
        <div
          id="cabin-detail-export"
          style={{ display: "grid", gap: 16, minWidth: 0 }}
        >
          {DAY_KEYS.map((dayKey) => {
            const slots = slotsByDay[dayKey] || [];
            const flights = flightsByDay[dayKey] || [];
            const demandBlocks = demandByDay[dayKey] || [];

            if (!slots.length && !flights.length && !demandBlocks.length && !editMode) {
              return null;
            }

            const arrivals = flights.filter((f) => f.movementType === "arrival").length;
            const departures = flights.filter((f) => f.movementType !== "arrival").length;
            const peakAgents =
              demandBlocks.length > 0
                ? Math.max(...demandBlocks.map((b) => b.recommendedAgents || 0))
                : 0;

            const shiftSummary = summarizeShifts(
              slots.filter((slot) => !slot.draftDeleteCandidate)
            );

            return (
              <PageCard key={dayKey} style={{ padding: isMobile ? 16 : 20 }}>
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
                      <span>Flights: <b>{flights.length}</b></span>
                      <span>Arrivals: <b>{arrivals}</b></span>
                      <span>Departures: <b>{departures}</b></span>
                      <span>Peak Agents: <b>{peakAgents}</b></span>
                    </div>
                  </div>

                  {editMode && (
                    <ActionButton
                      onClick={() => handleAddShiftRow(dayKey)}
                      variant="primary"
                      disabled={addingDayKey === dayKey || deleting || saving}
                    >
                      {addingDayKey === dayKey ? "Adding..." : "+ Add Shift Row"}
                    </ActionButton>
                  )}
                </div>

                <div style={{ marginTop: 20 }}>
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
                    <div style={emptyTextStyle}>No shifts found</div>
                  )}
                </div>

                <div style={{ marginTop: 22 }}>
                  <h3 style={subTitleStyle}>Assigned Schedule</h3>
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
                          <th style={thTdStyle}>Status</th>
                          {editMode && <th style={thTdStyle}>Delete</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((slot) => (
                          <tr
                            key={slot.id || slot.firestoreId}
                            style={
                              slot.draftDeleteCandidate
                                ? { background: "#fff1f2" }
                                : slot.draftMatched || slot.draftSource
                                ? { background: "#ecfdf5" }
                                : undefined
                            }
                          >
                            <td style={thTdStyle}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "5px 10px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  ...getSlotSourceStyle(slot),
                                }}
                              >
                                {getSlotSourceLabel(slot)}
                              </span>
                            </td>

                            <td style={thTdStyle}>
                              {editMode && !slot.draftDeleteCandidate ? (
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
                              {editMode && !slot.draftDeleteCandidate ? (
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
                              {editMode && !slot.draftDeleteCandidate ? (
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
                              {editMode && !slot.draftDeleteCandidate ? (
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
                                slot.employeeName ||
                                prettifyCodeName(slot.employeeId) ||
                                "Open"
                              )}
                            </td>

                            <td style={thTdStyle}>
                              {slot.draftDeleteCandidate ? (
                                <span style={deleteCandidateChipStyle}>Delete Candidate</span>
                              ) : (
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
                              )}
                            </td>

                            {editMode && (
                              <td style={thTdStyle}>
                                {slot.draftDeleteCandidate ? (
                                  <span style={{ color: "#9f1239", fontWeight: 700 }}>
                                    Draft only
                                  </span>
                                ) : (
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
                                )}
                              </td>
                            )}
                          </tr>
                        ))}

                        {slots.length === 0 && (
                          <tr>
                            <td
                              colSpan={editMode ? 8 : 7}
                              style={{
                                ...thTdStyle,
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              No assigned shifts yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 22 }}>
                  <h3 style={subTitleStyle}>Flights</h3>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRowStyle}>
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

                        {flights.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              style={{
                                ...thTdStyle,
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              No flights for this day.
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

  const visibleGroups = orderedGroups.filter(
    (groupName) => (groupedRoster[groupName] || []).length
  );

  return (
    <PageCard style={{ padding: 18 }}>
      <div style={rosterTopHeaderStyle}>
        <div style={rosterTopTitleStyle}>CABIN SERVICE WEEKLY SCHEDULE</div>
        <div style={rosterTopSubTitleStyle}>Week Start: {weekStartDate || "-"}</div>
      </div>

      {!visibleGroups.length ? (
        <div style={emptyTextStyle}>No roster rows found.</div>
      ) : (
        visibleGroups.map((groupName) => {
          const employees = groupedRoster[groupName] || [];
          return (
            <div key={groupName} style={rosterSectionWrapStyle}>
              <div style={rosterSectionHeaderStyle}>{groupName}</div>

              <div style={tableWrapStyle}>
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
                          <td style={rosterActionCellStyle}>
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
        })
      )}
    </PageCard>
  );
}

function buildRosterGroups(slotsByDay) {
  const grouped = {};

  Object.entries(slotsByDay || {}).forEach(([dayKey, slots]) => {
    (slots || [])
      .filter((slot) => !slot.draftDeleteCandidate)
      .forEach((slot) => {
        const employeeName = prettifyCodeName(
          slot.employeeName || slot.employeeId || "Open"
        );
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

        if (!employeeRow.days[dayKey]) {
          employeeRow.days[dayKey] = shiftLabel;
        } else if (!employeeRow.days[dayKey].split(" / ").includes(shiftLabel)) {
          employeeRow.days[dayKey] = `${employeeRow.days[dayKey]} / ${shiftLabel}`;
        }
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
    grouped[dayKey] = (grouped[dayKey] || []).sort(sorter);
  });

  return grouped;
}

function summarizeShifts(slots) {
  const map = new Map();

  for (const slot of slots || []) {
    const key = `${slot.start || ""}|${slot.end || ""}|${slot.role || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        start: slot.start || "",
        end: slot.end || "",
        role: slot.role || "Agent",
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
  if (!!a?.draftDeleteCandidate !== !!b?.draftDeleteCandidate) {
    return a?.draftDeleteCandidate ? 1 : -1;
  }

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
    employeeName: prettifyCodeName(slot.employeeName || ""),
    draftSource: !!slot.draftSource,
    draftMatched: !!slot.draftMatched,
    draftDeleteCandidate: !!slot.draftDeleteCandidate,
    sourceLabel: slot.sourceLabel || "",
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
  minWidth: 0,
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
  wordBreak: "break-word",
};

const subTitleStyle = {
  fontSize: 16,
  margin: "0 0 12px",
  color: "#0f172a",
  fontWeight: 800,
};

const dayStatsStyle = {
  display: "flex",
  gap: 18,
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

const tableWrapStyle = {
  overflowX: "auto",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  width: "100%",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 960,
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
  verticalAlign: "top",
};

const assignedChipStyle = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  fontSize: 12,
  fontWeight: 700,
};

const openChipStyle = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff1f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: 12,
  fontWeight: 700,
};

const deleteCandidateChipStyle = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff1f2",
  color: "#9f1239",
  border: "1px solid #fecdd3",
  fontSize: 12,
  fontWeight: 700,
};

const deleteSlotButtonStyle = {
  background: "#fff1f2",
  color: "#b91c1c",
  padding: "7px 10px",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const deleteRowButtonStyle = {
  background: "#fff1f2",
  color: "#b91c1c",
  padding: "6px 10px",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 11,
};

const rosterTopHeaderStyle = {
  marginBottom: 16,
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid #dbeafe",
  boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
};

const rosterTopTitleStyle = {
  background: "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
  color: "#ffffff",
  textAlign: "center",
  fontSize: 20,
  fontWeight: 800,
  padding: "14px 16px",
  letterSpacing: "0.04em",
};

const rosterTopSubTitleStyle = {
  background: "#f8fbff",
  color: "#0f172a",
  textAlign: "center",
  fontSize: 14,
  fontWeight: 700,
  padding: "10px 14px",
  borderTop: "1px solid #dbeafe",
};

const rosterSectionWrapStyle = {
  marginBottom: 18,
};

const rosterSectionHeaderStyle = {
  background: "#1769aa",
  color: "#ffffff",
  padding: "10px 14px",
  fontWeight: 800,
  fontSize: 15,
  borderTopLeftRadius: 14,
  borderTopRightRadius: 14,
  letterSpacing: "0.02em",
};

const rosterTableStyle = {
  width: "100%",
  minWidth: 720,
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "#ffffff",
};

const rosterHeaderCellStyle = {
  border: "1px solid #dbeafe",
  padding: "6px 2px",
  textAlign: "center",
  fontSize: 9,
  fontWeight: 900,
  background: "#f8fbff",
  color: "#1769aa",
  letterSpacing: "0.03em",
};

const rosterEmployeeHeaderStyle = {
  width: 320,
};

const rosterCellStyle = {
  border: "1px solid #e2e8f0",
  padding: "4px 2px",
  textAlign: "center",
  fontSize: 9,
  fontWeight: 700,
  background: "#ffffff",
  color: "#111827",
  width: 48,
  lineHeight: 1.1,
};

const rosterNameCellStyle = {
  ...rosterCellStyle,
  textAlign: "left",
  fontWeight: 900,
  fontSize: 22,
  paddingLeft: 12,
  width: 320,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rosterActionCellStyle = {
  ...rosterCellStyle,
  width: 82,
};

const rosterOffCellStyle = {
  background: "#f1f5f9",
  color: "#475569",
  fontWeight: 700,
};

const selectStyle = {
  minWidth: 160,
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#ffffff",
};

const timeInputStyle = {
  minWidth: 110,
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#ffffff",
};
