import React, { useState } from "react";
import ScheduleCell from "./ScheduleCell";

export default function ScheduleGrid({ employees, dayNumbers, onSave }) {
  const emptyRow = {
    employeeId: "",
    mon: [{ start: "", end: "" }, { start: "", end: "" }],
    tue: [{ start: "", end: "" }, { start: "", end: "" }],
    wed: [{ start: "", end: "" }, { start: "", end: "" }],
    thu: [{ start: "", end: "" }, { start: "", end: "" }],
    fri: [{ start: "", end: "" }, { start: "", end: "" }],
    sat: [{ start: "", end: "" }, { start: "", end: "" }],
    sun: [{ start: "", end: "" }, { start: "", end: "" }],
  };

  const [rows, setRows] = useState([emptyRow]);

  const addRow = () => setRows([...rows, emptyRow]);

  const updateRow = (index, newData) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], ...newData };
    setRows(updated);
  };

  const handleSave = () => {
    onSave(rows);
  };

  return (
    <div className="space-y-3">
      <table className="table border border-black">
        <thead className="bg-black text-white text-[11px]">
          <tr>
            <th className="w-32 text-center">EMPLOYEE</th>
            {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => (
              <th key={d} className="text-center">
                {d.toUpperCase()} / {dayNumbers[d] || ""}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border border-black">
              {/* EMPLOYEE NAME */}
              <td className="border border-black p-1">
                <select
                  className="border rounded w-full text-xs px-1 py-1"
                  value={row.employeeId}
                  onChange={(e) =>
                    updateRow(index, { employeeId: e.target.value })
                  }
                >
                  <option value="">Select</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </td>

              {/* DAYS */}
              {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
                <td key={day} className="border border-black p-1">
                  <ScheduleCell
                    value={row[day]}
                    onChange={(val) =>
                      updateRow(index, { [day]: val })
                    }
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
