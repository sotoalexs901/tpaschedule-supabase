import React from "react";
import ScheduleCell from "./ScheduleCell";

export default function ScheduleGrid({
  employees,
  dayNumbers,
  onSave,
  rows,
  setRows,
  airline,
  department,
}) {
  const addRow = () => {
    setRows([
      ...rows,
      {
        employeeId: "",
        mon: [{ start: "", end: "" }, { start: "", end: "" }],
        tue: [{ start: "", end: "" }, { start: "", end: "" }],
        wed: [{ start: "", end: "" }, { start: "", end: "" }],
        thu: [{ start: "", end: "" }, { start: "", end: "" }],
        fri: [{ start: "", end: "" }, { start: "", end: "" }],
        sat: [{ start: "", end: "" }, { start: "", end: "" }],
        sun: [{ start: "", end: "" }, { start: "", end: "" }],
      },
    ]);
  };

  // Color class selector (based on airline + dept)
  const getColorClass = () => {
    if (airline === "SY") return "airline-SY";
    if (airline === "AV") return "airline-AV";
    if (airline === "WL") return "airline-WL";
    if (airline === "EA") return "airline-EA";
    if (airline === "WCHR") return "airline-WCHR";
    if (airline === "AA-BSO") return "airline-AABSO";
    if (airline === "CABIN") return "airline-CABIN";
    return "airline-OTHER";
  };

  const colorClass = getColorClass();

  const handleSave = () => onSave(rows);

  return (
    <div className="space-y-3">
      <table className="schedule-table">
        <thead>
          <tr className="schedule-header">
            <th>EMPLOYEE</th>
            {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => (
              <th key={d}>
                {d.toUpperCase()} / {dayNumbers[d] || ""}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="employee-cell border-black border-2">
                <select
                  className="border rounded w-full text-xs px-1 py-1"
                  value={row.employeeId}
                  onChange={(e) => {
                    const updated = [...rows];
                    updated[index].employeeId = e.target.value;
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
              </td>

              {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
                <td
                  key={day}
                  className={`${colorClass} border-black border-2 p-1`}
                >
                  <ScheduleCell
                    value={row[day]}
                    onChange={(val) => {
                      const updated = [...rows];
                      updated[index][day] = val;
                      setRows(updated);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn w-full" onClick={addRow}>
        + Add Employee Row
      </button>

      <button className="btn-primary w-full" onClick={handleSave}>
        Submit Schedule
      </button>
    </div>
  );
}
