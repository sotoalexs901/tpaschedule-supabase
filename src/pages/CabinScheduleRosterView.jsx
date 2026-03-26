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

// 🔥 Define aquí cómo agrupar los shifts
function getShiftGroup(slot) {
  const start = slot.start || "";

  if (slot.role === "LAV") return "LAV";
  if (slot.role === "Supervisor") return "SUPERVISOR";

  if (start >= "04:00" && start < "07:00") return "TEAM 1";
  if (start >= "07:00" && start < "11:00") return "TEAM 2";
  if (start >= "11:00" && start < "15:00") return "TEAM 3";
  return "NIGHT SHIFT";
}

// Convierte slots → estructura por empleado
function buildRoster(slotsByDay) {
  const roster = {};

  Object.entries(slotsByDay).forEach(([dayKey, slots]) => {
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

  return (
    <div style={{ marginTop: 20 }}>
      {Object.entries(grouped).map(([groupName, employees]) => (
        <div key={groupName} style={{ marginBottom: 30 }}>
          <h2 style={groupTitle}>{groupName}</h2>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Employee</th>
                {DAY_KEYS.map((d) => (
                  <th key={d} style={cellStyle}>
                    {DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {employees.map((emp) => (
                <tr key={emp.name}>
                  <td style={cellStyleBold}>{emp.name}</td>

                  {DAY_KEYS.map((d) => (
                    <td key={d} style={cellStyle}>
                      {emp.days[d] || "OFF"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// estilos
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 10,
};

const cellStyle = {
  border: "1px solid #ccc",
  padding: 6,
  textAlign: "center",
  fontSize: 13,
};

const cellStyleBold = {
  ...cellStyle,
  fontWeight: "bold",
  textAlign: "left",
};

const groupTitle = {
  background: "#1d4ed8",
  color: "white",
  padding: "6px 10px",
  fontSize: 14,
};
