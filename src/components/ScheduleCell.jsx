import React from "react";

export default function ScheduleCell({ value, onChange }) {
  const handleChange = (i, field, newVal) => {
    const updated = [...value];
    updated[i][field] = newVal.toUpperCase();

    // If "OFF" entered → clear both start/end
    if (newVal.toUpperCase() === "OFF") {
      updated[i] = { start: "OFF", end: "" };
      updated[1] = { start: "", end: "" }; // second row blank
    }

    onChange(updated);
  };

  return (
    <div className="flex flex-col space-y-1 text-[11px]">
      {[0, 1].map((i) => (
        <div key={i} className="flex space-x-1">
          <input
            className="border rounded w-12 text-center px-1"
            value={value[i].start}
            placeholder="08:00"
            onChange={(e) => handleChange(i, "start", e.target.value)}
          />
          <span>-</span>
          <input
            className="border rounded w-12 text-center px-1"
            value={value[i].end}
            placeholder="12:30"
            onChange={(e) => handleChange(i, "end", e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
