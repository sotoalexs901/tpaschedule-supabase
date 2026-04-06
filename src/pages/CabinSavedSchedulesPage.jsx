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
  return String(value || "").trim().toLowerCase();
}

function prettifyCodeName(value) {
  const clean = normalizeText(value);
  if (!clean) return "-";

  if (clean.includes("@")) {
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

  if (/^[a-z]+[0-9]*$/i.test(clean) && clean === clean.toLowerCase()) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean;
}

function getEmployeeVisibleName(employee) {
  return (
    employee?.name ||
    employee?.employeeName ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.username ||
    employee?.loginUsername ||
    ""
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

function formatDateTime(value) {
  try {
    if (!value) return "-";
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function countFlights(schedule) {
  if (typeof schedule?.totalFlights === "number") return schedule.totalFlights;

  if (Array.isArray(schedule?.flights)) return schedule.flights.length;
  if (Array.isArray(schedule?.flightList)) return schedule.flightList.length;
  if (Array.isArray(schedule?.uploadedFlights)) return schedule.uploadedFlights.length;

  return 0;
}

function countShiftRows(schedule) {
  if (typeof schedule?.totalShiftRows === "number") return schedule.totalShiftRows;
  if (typeof schedule?.shiftRowsCount === "number") return schedule.shiftRowsCount;

  if (Array.isArray(schedule?.shiftRows)) return schedule.shiftRows.length;
  if (Array.isArray(schedule?.rosterRows)) return schedule.rosterRows.length;
  if (Array.isArray(schedule?.assignments)) return schedule.assignments.length;
  if (Array.isArray(schedule?.slots)) return schedule.slots.length;

  if (Array.isArray(schedule?.generatedSchedule)) {
    return schedule.generatedSchedule.reduce((sum, dayItem) => {
      if (Array.isArray(dayItem?.rows)) return sum + dayItem.rows.length;
      if (Array.isArray(dayItem?.assignments)) return sum + dayItem.assignments.length;
      if (Array.isArray(dayItem?.slots)) return sum + dayItem.slots.length;
      return sum;
    }, 0);
  }

  if (schedule?.dailySchedules && typeof schedule.dailySchedules === "object") {
    return Object.values(schedule.dailySchedules).reduce((sum, dayItem) => {
      if (Array.isArray(dayItem?.rows)) return sum + dayItem.rows.length;
      if (Array.isArray(dayItem?.assignments)) return sum + dayItem.assignments.length;
      if (Array.isArray(dayItem?.slots)) return sum + dayItem.slots.length;
      if (Array.isArray(dayItem)) return sum + dayItem.length;
      return sum;
    }, 0);
  }

  return typeof schedule?.totalSlots === "number" ? schedule.totalSlots : 0;
}

function countUploadedDays(schedule) {
  if (Array.isArray(schedule?.uploadedDays)) return schedule.uploadedDays.length;
  if (Array.isArray(schedule?.daysUploaded)) return schedule.daysUploaded.length;
  if (Array.isArray(schedule?.selectedDays)) return schedule.selectedDays.length;

  if (schedule?.dailySchedules && typeof schedule.dailySchedules === "object") {
    return Object.keys(schedule.dailySchedules).length;
  }

  if (Array.isArray(schedule?.generatedSchedule)) {
    return schedule.generatedSchedule.length;
  }

  return 0;
}

function getWeekStartLabel(schedule) {
  return (
    schedule?.weekStartDate ||
    schedule?.weekStart ||
    schedule?.startDate ||
    schedule?.weekOf ||
    "-"
  );
}

export default function CabinSavedSchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSchedules() {
      try {
        setLoading(true);
        setError("");

        const [scheduleSnap, employeeSnap] = await Promise.all([
          getDocs(
            query(collection(db, "cabinSchedules"), orderBy("createdAt", "desc"))
          ),
          getDocs(collection(db, "employees")),
        ]);

        const employeeRows = employeeSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        const items = scheduleSnap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
          };
        });

        setEmployees(employeeRows);
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

  const employeeMap = useMemo(() => {
    const map = {};

    employees.forEach((employee) => {
      const visibleName = getEmployeeVisibleName(employee);
      if (!visibleName) return;

      const possibleKeys = [
        employee?.username,
        employee?.loginUsername,
        employee?.email,
        employee?.displayName,
        employee?.fullName,
        employee?.name,
        employee?.employeeName,
      ]
        .map((item) => normalizeLookup(item))
        .filter(Boolean);

      possibleKeys.forEach((key) => {
        map[key] = visibleName;
      });
    });

    return map;
  }, [employees]);

  const preparedSchedules = useMemo(() => {
    return schedules.map((item) => ({
      ...item,
      resolvedCreatedBy: resolveCreatedByName(item, employeeMap),
      resolvedWeekStart: getWeekStartLabel(item),
      resolvedUploadedDays: countUploadedDays(item),
      resolvedFlights: countFlights(item),
      resolvedShiftRows: countShiftRows(item),
      resolvedCreatedAt: formatDateTime(item?.createdAt),
    }));
  }, [schedules, employeeMap]);

  const totalSchedules = useMemo(() => preparedSchedules.length, [preparedSchedules]);

  const totalShiftRows = useMemo(() => {
    return preparedSchedules.reduce(
      (sum, item) => sum + Number(item.resolvedShiftRows || 0),
      0
    );
  }, [preparedSchedules]);

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
              Total Shift Rows
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
              {totalShiftRows}
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

        {!loading && !error && preparedSchedules.length === 0 && (
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

        {!loading && !error && preparedSchedules.length > 0 && (
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
                minWidth: 1080,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Week Start</th>
                  <th style={thStyle}>Created By</th>
                  <th style={thStyle}>Created At</th>
                  <th style={thStyle}>Uploaded Days</th>
                  <th style={thStyle}>Flights</th>
                  <th style={thStyle}>Shift Rows</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {preparedSchedules.map((item, index) => (
                  <tr
                    key={item.id}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{item.resolvedWeekStart}</td>
                    <td style={tdStyle}>{item.resolvedCreatedBy}</td>
                    <td style={tdStyle}>{item.resolvedCreatedAt}</td>
                    <td style={tdStyle}>{item.resolvedUploadedDays}</td>
                    <td style={tdStyle}>{item.resolvedFlights}</td>
                    <td style={tdStyle}>{item.resolvedShiftRows}</td>
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
