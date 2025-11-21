import React from "react";

const TIME_OPTIONS = (() => {
  const arr = ["OFF"];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return arr;
})();

export default function ScheduleCell({
  day,
  row,
  rowIndex,
  rows,
  setRows,
  readonly,
}) {
  const shifts = row[day] || [];

  const update = (shiftIndex, field, value) => {
    if (readonly) return;

    const updated = [...rows];
    const current = updated[rowIndex][day];

    if (field === "start" && value === "OFF") {
      current[shiftIndex] = { start: "OFF", end: "" };
    } else {
      current[shiftIndex][field] = value;
    }

    setRows(updated);
  };

  const addSecondShift = () => {
    if (shifts.length < 2) {
      const updated = [...rows];
      updated[rowIndex][day].push({ start: "", end: "" });
      setRows(updated);
    }
  };

  return (
    <div className="p-1 border-l text-xs">

      {/* First Shift */}
      <div className="flex gap-1">
        <select
          className="border p-1 w-[60px]"
          value={shifts[0].start}
          onChange={(e) => update(0, "start", e.target.value)}
          disabled={readonly}
        >
          <option value="">Start</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {shifts[0].start !== "OFF" && (
          <select
            className="border p-1 w-[60px]"
            value={shifts[0].end}
            onChange={(e) => update(0, "end", e.target.value)}
            disabled={readonly}
          >
            <option value="">End</option>
            {TIME_OPTIONS.filter((x) => x !== "OFF").map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Second Shift */}
      {shifts[1] && (
        <div className="flex gap-1 mt-1 border-t pt-1">
          <select
            className="border p-1 w-[60px]"
            value={shifts[1].start}
            onChange={(e) => update(1, "start", e.target.value)}
            disabled={readonly}
          >
            <option value="">Start 2</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>

          {shifts[1].start !== "OFF" && (
            <select
              className="border p-1 w-[60px]"
              value={shifts[1].end}
              onChange={(e) => update(1, "end", e.target.value)}
              disabled={readonly}
            >
              <option value="">End 2</option>
              {TIME_OPTIONS.filter((x) => x !== "OFF").map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!readonly && shifts.length < 2 && (
        <button
          className="text-[10px] text-blue-500 mt-1"
          onClick={addSecondShift}
        >
          + 2nd shift
        </button>
      )}
    </div>
  );
}
