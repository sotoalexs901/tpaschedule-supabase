import React from "react";
import ScheduleCell from "./ScheduleCell";

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
      {/* HEADER */}
      <div className="grid grid-cols-9 bg-gray-200 font-bold text-sm text-center p-2 border-b">
        <div>Employee</div>
        {days.map((d) => (
          <div key={d} className="uppercase">
            {d} <br />
            <span className="text-xs">{dayNumbers[d] || ""}</span>
          </div>
        ))}
      </div>

      {/* BODY */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-9 border-b text-center items-center"
        >
          {/* Employee name */}
          <div className="p-1">
            {!readonly ? (
              <select
                className="border w-full p-1"
                value={row.employeeId}
                onChange={(e) => {
                  const updated = [...rows];
                  updated[idx].employeeId = e.target.value;
                  setRows(updated);
                }}
              >
                <option value="">Select</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-medium">
                {employees.find((x) => x.id === row.employeeId)?.name ||
                  "Unknown"}
              </div>
            )}
          </div>

          {/* Day cells */}
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

      {/* Add row button */}
      {!readonly && (
        <button
          onClick={addRow}
          className="w-full bg-blue-600 text-white py-2 mt-2"
        >
          + Add row
        </button>
      )}
    </div>
  );
}
