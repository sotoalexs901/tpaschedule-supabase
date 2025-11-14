import React from "react";

// Generamos las opciones de hora en formato 24h cada 30 minutos
const TIME_OPTIONS = (() => {
  const arr = ["OFF"];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      arr.push(`${hh}:${mm}`);
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

    if (!current[shiftIndex]) {
      current[shiftIndex] = { start: "", end: "" };
    }

    if (field === "start" && value === "OFF") {
      current[shiftIndex].start = "OFF";
      current[shiftIndex].end = "";
    } else {
      current[shiftIndex][field] = value;
    }

    updated[rowIndex][day] = [...current];
    setRows(updated);
  };

  const addSecondShift = () => {
    if (readonly) return;

    const updated = [...rows];
    const current = updated[rowIndex][day] || [];

    if (current.length < 2) {
      current.push({ start: "", end: "" });
    }

    updated[rowIndex][day] = current;
    setRows(updated);
  };

  return (
    <div className="p-1 border-l text-xs">

      {/* SHIFT 1 */}
      {shifts[0] && (shifts[0].start || shifts[0].end || !readonly) && (
        <div className="mb-1">
          {readonly ? (
            <div>
              {shifts[0].start
                ? `${shifts[0].start}${shifts[0].end ? ` - ${shifts[0].end}` : ""}`
                : ""}
            </div>
          ) : (
            <div className="flex gap-1 items-center">
              {/* Start */}
              <select
                className="border p-1 text-[11px] w-[55px]"
                value={shifts[0].start || ""}
                onChange={(e) => update(0, "start", e.target.value)}
              >
                <option value="">Start</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* End */}
              {shifts[0].start !== "OFF" && (
                <select
                  className="border p-1 text-[11px] w-[55px]"
                  value={shifts[0].end || ""}
                  onChange={(e) => update(0, "end", e.target.value)}
                >
                  <option value="">End</option>
                  {TIME_OPTIONS.filter((t) => t !== "OFF").map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* SHIFT 2 */}
      {shifts[1] && (shifts[1].start || shifts[1].end || !readonly) && (
        <div className="mt-1 border-t pt-1">
          {readonly ? (
            <div>
              {shifts[1].start
                ? `${shifts[1].start}${shifts[1].end ? ` - ${shifts[1].end}` : ""}`
                : ""}
            </div>
          ) : (
            <div className="flex gap-1 items-center">
              {/* Start 2 */}
              <select
                className="border p-1 text-[11px] w-[55px]"
                value={shifts[1].start || ""}
                onChange={(e) => update(1, "start", e.target.value)}
              >
                <option value="">Start 2</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* End 2 */}
              {shifts[1].start !== "OFF" && (
                <select
                  className="border p-1 text-[11px] w-[55px]"
                  value={shifts[1].end || ""}
                  onChange={(e) => update(1, "end", e.target.value)}
                >
                  <option value="">End 2</option>
                  {TIME_OPTIONS.filter((t) => t !== "OFF").map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* ADD SECOND SHIFT BUTTON */}
      {!readonly && shifts.length < 2 && (
        <button
          className="mt-1 text-[10px] text-blue-600 underline"
          onClick={addSecondShift}
        >
          + 2nd shift
        </button>
      )}
    </div>
  );
}
