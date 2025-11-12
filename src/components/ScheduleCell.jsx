import React from "react";

export default function ScheduleCell({ value, onChange }) {
  const handleChange = (i, field, newVal) => {
    const updated = [...value];
    updated[i][field] = newVal.toUpperCase();

    // OFF logic
    if (newVal.toUpperCase() === "OFF") {
      updated[i] = { start: "OFF", end: "" };
      updated[1] = { start: "", end: "" };
    }

    onChange(updated);
  };

  return (
    <div className="shift-cell">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center space-x-1">
          <input
            className="shift-input"
            value={value[i].start}
            placeholder="08:00"
            onChange={(e) => handleChange(i, "start", e.target.value)}
          />
          <span className="font-bold">-</span>
          <input
            className="shift-input"
            value={value[i].end}
            placeholder="12:30"
            onChange={(e) => handleChange(i, "end", e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
