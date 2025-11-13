import React from "react";

/**
 * ScheduleCell → Maneja 2 turnos por día:
 *
 *  Turno 1: [HH:MM] - [HH:MM]
 *  Turno 2: [HH:MM] - [HH:MM]
 *
 *  OFF: si el usuario escribe "OFF", limpia todo y deja la celda en blanco,
 *  excepto la palabra OFF en el primer turno.
 */
export default function ScheduleCell({ value, onChange }) {
  const handleChange = (i, field, newVal) => {
    const updated = [...value];
    const upper = newVal.toUpperCase();

    // If user types OFF anywhere
    if (upper === "OFF") {
      updated[0] = { start: "OFF", end: "" };
      updated[1] = { start: "", end: "" };
      onChange(updated);
      return;
    }

    // Normal hour input
    updated[i][field] = newVal;
    onChange(updated);
  };

  return (
    <div className="shift-cell">
      {/* TURN 1 */}
      <div className="flex items-center space-x-1">
        <input
          className={`shift-input`}
          value={value[0].start}
          placeholder="08:00"
          onChange={(e) => handleChange(0, "start", e.target.value)}
        />
        <span className="font-bold text-xs">-</span>
        <input
          className={`shift-input`}
          value={value[0].end}
          placeholder="12:30"
          onChange={(e) => handleChange(0, "end", e.target.value)}
        />
      </div>

      {/* TURN 2 */}
      <div className="flex items-center space-x-1">
        <input
          className="shift-input"
          value={value[1].start}
          placeholder="--:--"
          onChange={(e) => handleChange(1, "start", e.target.value)}
        />
        <span className="font-bold text-xs">-</span>
        <input
          className="shift-input"
          value={value[1].end}
          placeholder="--:--"
          onChange={(e) => handleChange(1, "end", e.target.value)}
        />
      </div>
    </div>
  );
}
