import React from "react";

export default function ScheduleCell({
  day,
  row,
  rowIndex,
  rows,
  setRows,
  readonly
}) {
  const update = (shiftIndex, field, value) => {
    if (readonly) return;
    const updated = [...rows];
    updated[rowIndex][day][shiftIndex][field] = value;
    setRows(updated);
  };

  const addShift = () => {
    if (readonly) return;
    const updated = [...rows];
    updated[rowIndex][day].push({ start: "", end: "" });
    setRows(updated);
  };

  return (
    <div className="p-1 border-l">
      {row[day].map((shift, shiftIndex) => (
        <div key={shiftIndex} className="flex flex-col gap-1">
          {readonly ? (
            <div className="text-xs">
              {shift.start} - {shift.end}
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="00:00"
                className="border p-1 text-xs"
                value={shift.start}
                onChange={(e) => update(shiftIndex, "start", e.target.value)}
              />
              <input
                type="text"
                placeholder="00:00"
                className="border p-1 text-xs"
                value={shift.end}
                onChange={(e) => update(shiftIndex, "end", e.target.value)}
              />
            </>
          )}
        </div>
      ))}

      {!readonly && (
        <button
          className="text-xs text-blue-600 mt-1"
          onClick={addShift}
        >
          + Shift
        </button>
      )}
    </div>
  );
}
