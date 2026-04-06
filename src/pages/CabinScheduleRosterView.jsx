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

function safeString(value) {
  return String(value || "").trim();
}

function prettifyCodeName(value) {
  const clean = safeString(value);
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

function normalizeTimeForCompare(value) {
  const str = safeString(value);
  if (!str) return "";

  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }

  return str;
}

function compactTime(value) {
  const str = safeString(value);
  if (!str.includes(":")) return str;

  const [hh, mm] = str.split(":");
  return `${hh}${mm}`;
}

function buildShiftLabel(slot) {
  const start = compactTime(slot.start);
  const end = compactTime(slot.end);

  if (!start || !end) return "SHIFT";
  return `${start}-${end}`;
}

function getShiftGroup(slot) {
  const start = normalizeTimeForCompare(slot.start || "");
  const role = safeString(slot.role);

  if (role === "LAV") return "LAV";
  if (role === "Supervisor") return "SUPERVISOR";

  if (start >= "04:00" && start < "07:00") return "TEAM 1";
  if (start >= "07:00" && start < "11:00") return "TEAM 2";
  if (start >= "11:00" && start < "15:00") return "TEAM 3";
  return "NIGHT SHIFT";
}

function getVisibleEmployeeName(slot) {
  return (
    prettifyCodeName(slot.employeeName) ||
    prettifyCodeName(slot.employeeId) ||
    "UNASSIGNED"
  );
}

function buildRoster(slotsByDay) {
  const roster = {};

  Object.entries(slotsByDay || {}).forEach(([dayKey, slots]) => {
    (slots || []).forEach((slot) => {
      const empName = getVisibleEmployeeName(slot);
      const slotGroup = getShiftGroup(slot);
      const shiftLabel = buildShiftLabel(slot);

      if (!roster[empName]) {
        roster[empName] = {
          name: empName,
          group: slotGroup,
          days: {},
        };
      }

      if (!roster[empName].days[dayKey]) {
        roster[empName].days[dayKey] = shiftLabel;
      } else {
        const existing = roster[empName].days[dayKey];
        if (!existing.split(" / ").includes(shiftLabel)) {
          roster[empName].days[dayKey] = `${existing} / ${shiftLabel}`;
        }
      }

      if (roster[empName].group === "NIGHT SHIFT" && slotGroup !== "NIGHT SHIFT") {
        roster[empName].group = slotGroup;
      }
    });
  });

  return Object.values(roster).sort((a, b) => a.name.localeCompare(b.name));
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
                  minWidth: 820,
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
                        minWidth: 220,
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
                      key={`${groupName}-${emp.name}-${index}`}
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                      }}
                    >
                      <td
                        style={{
                          ...nameCellStyle,
                          minWidth: 220,
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
