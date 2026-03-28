// src/components/CabinScheduleRosterView.jsx
import React, { useMemo } from "react";

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
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

function getShiftGroup(slot) {
  const start = slot.start || "";

  if (slot.role === "LAV") return "LAV";
  if (slot.role === "Supervisor") return "SUPERVISOR";

  if (start >= "04:00" && start < "07:00") return "TEAM 1";
  if (start >= "07:00" && start < "11:00") return "TEAM 2";
  if (start >= "11:00" && start < "15:00") return "TEAM 3";
  return "NIGHT SHIFT";
}

function buildRoster(slotsByDay) {
  const roster = {};

  Object.entries(slotsByDay || {}).forEach(([dayKey, slots]) => {
    slots.forEach((slot) => {
      const empName = slot.employeeName || "UNASSIGNED";

      if (!roster[empName]) {
        roster[empName] = {
          name: empName,
          group: getShiftGroup(slot),
          days: {},
        };
      }

      roster[empName].days[dayKey] = `${slot.start}-${slot.end}`;
    });
  });

  return Object.values(roster);
}

export default function CabinScheduleRosterView({ slotsByDay }) {
  const roster = useMemo(() => buildRoster(slotsByDay), [slotsByDay]);

  const grouped = useMemo(() => {
    const groups = {};

    roster.forEach((emp) => {
      if (!groups[emp.group]) groups[emp.group] = [];
      groups[emp.group].push(emp);
    });

    return groups;
  }, [roster]);

  const orderedGroups = [
    "SUPERVISOR",
    "LAV",
    "TEAM 1",
    "TEAM 2",
    "TEAM 3",
    "NIGHT SHIFT",
  ];

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        marginTop: 8,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      {orderedGroups.map((groupName) => {
        const employees = grouped[groupName] || [];
        if (!employees.length) return null;

        return (
          <div
            key={groupName}
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.98)",
              borderRadius: 22,
              boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
                color: "#ffffff",
                padding: "12px 16px",
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: "0.03em",
              }}
            >
              {groupName}
            </div>

            <div
              style={{
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 860,
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  background: "#ffffff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th
                      style={{
                        ...headerCellStyle,
                        minWidth: 240,
                        textAlign: "left",
                      }}
                    >
                      Employee
                    </th>

                    {DAY_KEYS.map((d) => (
                      <th key={d} style={headerCellStyle}>
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {employees.map((emp, index) => (
                    <tr
                      key={emp.name}
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                      }}
                    >
                      <td
                        style={{
                          ...nameCellStyle,
                          minWidth: 240,
                        }}
                      >
                        {emp.name}
                      </td>

                      {DAY_KEYS.map((d) => {
                        const value = emp.days[d] || "OFF";
                        const isOff = value === "OFF";

                        return (
                          <td
                            key={d}
                            style={{
                              ...bodyCellStyle,
                              ...(isOff
                                ? {
                                    background: "#f1f5f9",
                                    color: "#64748b",
                                    fontWeight: 700,
                                  }
                                : {
                                    color: "#0f172a",
                                    fontWeight: 700,
                                  }),
                            }}
                          >
                            {value}
                          </td>
                        );
                      })}
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

const headerCellStyle = {
  borderBottom: "1px solid #dbeafe",
  padding: "12px 10px",
  textAlign: "center",
  fontSize: 12,
  fontWeight: 800,
  background: "#f8fbff",
  color: "#1769aa",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
};

const bodyCellStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "12px 10px",
  textAlign: "center",
  fontSize: 13,
  verticalAlign: "middle",
};

const nameCellStyle = {
  ...bodyCellStyle,
  textAlign: "left",
  fontWeight: 800,
  color: "#0f172a",
  paddingLeft: 14,
};
