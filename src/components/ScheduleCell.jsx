import React from "react";

const TIME_OPTIONS = (() => {
  const arr = ["OFF"];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      arr.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
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
  const shifts =
    Array.isArray(row?.[day]) && row[day].length > 0
      ? row[day]
      : [{ start: "", end: "" }];

  const update = (shiftIndex, field, value) => {
    if (readonly) return;

    const updated = rows.map((item, index) => {
      if (index !== rowIndex) return item;

      const dayShifts =
        Array.isArray(item?.[day]) && item[day].length > 0
          ? [...item[day].map((shift) => ({ ...shift }))]
          : [{ start: "", end: "" }];

      if (!dayShifts[shiftIndex]) {
        dayShifts[shiftIndex] = { start: "", end: "" };
      }

      if (field === "start" && value === "OFF") {
        dayShifts[shiftIndex] = { start: "OFF", end: "" };
      } else {
        dayShifts[shiftIndex][field] = value;
      }

      return {
        ...item,
        [day]: dayShifts,
      };
    });

    setRows(updated);
  };

  const addSecondShift = () => {
    if (readonly || shifts.length >= 2) return;

    const updated = rows.map((item, index) => {
      if (index !== rowIndex) return item;

      const dayShifts =
        Array.isArray(item?.[day]) && item[day].length > 0
          ? [...item[day].map((shift) => ({ ...shift }))]
          : [{ start: "", end: "" }];

      dayShifts.push({ start: "", end: "" });

      return {
        ...item,
        [day]: dayShifts,
      };
    });

    setRows(updated);
  };

  return (
    <div className="p-1 border-l text-xs">
      <div className="flex gap-1">
        <select
          className="border p-1 w-[60px]"
          value={shifts[0]?.start || ""}
          onChange={(e) => update(0, "start", e.target.value)}
          disabled={readonly}
        >
          <option value="">Start</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {shifts[0]?.start !== "OFF" && (
          <select
            className="border p-1 w-[60px]"
            value={shifts[0]?.end || ""}
            onChange={(e) => update(0, "end", e.target.value)}
            disabled={readonly}
          >
            <option value="">End</option>
            {TIME_OPTIONS.filter((x) => x !== "OFF").map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {shifts[1] && (
        <div className="flex gap-1 mt-1 border-t pt-1">
          <select
            className="border p-1 w-[60px]"
            value={shifts[1]?.start || ""}
            onChange={(e) => update(1, "start", e.target.value)}
            disabled={readonly}
          >
            <option value="">Start 2</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {shifts[1]?.start !== "OFF" && (
            <select
              className="border p-1 w-[60px]"
              value={shifts[1]?.end || ""}
              onChange={(e) => update(1, "end", e.target.value)}
              disabled={readonly}
            >
              <option value="">End 2</option>
              {TIME_OPTIONS.filter((x) => x !== "OFF").map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {!readonly && shifts.length < 2 && (
        <button
          type="button"
          className="text-[10px] text-blue-500 mt-1"
          onClick={addSecondShift}
        >
          + 2nd shift
        </button>
      )}
    </div>
  );
}
