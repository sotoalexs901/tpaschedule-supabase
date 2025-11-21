import React from "react";
import ScheduleCell from "./ScheduleCell";

const AIRLINE_LOGOS = {
  SY: "URL",
  "WL Havana Air": "URL",
  "WL Invicta": "URL",
  AV: "URL",
  EA: "URL",
  WCHR: "URL",
  CABIN: "URL",
  "AA-BSO": "URL",
  OTHER: "URL",
};

const AIRLINE_COLORS = {
  SY: "#F28C28",
  "WL Havana Air": "#3A7BD5",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
};

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers,
  onSave,
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const headerColor = AIRLINE_COLORS[airline];
  const logo = AIRLINE_LOGOS[airline];

  const addRow = () => {
    if (readonly) return;
    setRows([
      ...rows,
      {
        employeeId: "",
        mon: [{ start: "", end: "" }],
        tue: [{ start: "", end: "" }],
        wed: [{ start: "", end: "" }],
        thu: [{ start: "", end: "" }],
        fri: [{ start: "", end: "" }],
        sat: [{ start: "", end: "" }],
        sun: [{ start: "", end: "" }],
      },
    ]);
  };

  return (
    <div className="border bg-white">
      <div
        className="grid grid-cols-9 text-white p-2 border-b"
        style={{ backgroundColor: headerColor }}
      >
        <div className="text-center">
          {logo && <img src={logo} className="h-10 mx-auto mb-1" />}
          <span>{airline} — {department}</span>
        </div>

        {days.map((d) => (
          <div key={d} className="text-center uppercase">
            {d}
            <br />
            <span className="text-xs">{dayNumbers[d]}</span>
          </div>
        ))}
      </div>

      {rows.map((row, idx) => (
        <div key={idx} className="grid grid-cols-9 border-b">
          <div className="p-2">
            {!readonly ? (
              <select
                className="border p-1 w-full"
                value={row.employeeId}
                onChange={(e) => {
                  const updated = [...rows];
                  updated[idx].employeeId = e.target.value;
                  setRows(updated);
                }}
              >
                <option value="">Select</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              employees.find((e) => e.id === row.employeeId)?.name || "Unknown"
            )}
          </div>

          {days.map((day) => (
            <ScheduleCell
              key={day}
              day={day}
              row={row}
              rowIndex={idx}
              rows={rows}
              setRows={setRows}
              readonly={readonly}
            />
          ))}
        </div>
      ))}

      {!readonly && (
        <button
          onClick={addRow}
          className="w-full bg-blue-600 text-white py-2"
        >
          + Add Employee
        </button>
      )}

      {!readonly && onSave && (
        <div className="p-3">
          <button
            onClick={onSave}
            className="bg-green-600 text-white px-4 py-2 rounded w-full"
          >
            Submit for approval
          </button>
        </div>
      )}
    </div>
  );
}
