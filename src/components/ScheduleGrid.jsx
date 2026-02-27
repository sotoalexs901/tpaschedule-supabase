// src/components/ScheduleGrid.jsx
import React from "react";

// 🎨 Colores por aerolínea
// ✅ Importante: NO amarramos el color a "WL Havana Air" como texto fijo.
// Usamos claves genéricas (SY, WL, AV, EA, etc.)
const AIRLINE_COLORS = {
  SY: "#F28C28",
  WL: "#3A7BD5", // ✅ WL genérico (antes estaba "WL Havana Air")
  "WL Invicta": "#0057B8", // si quieres mantener dos tonos, lo dejamos
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
};

// ⏰ Opciones de hora (cada 15 min + OFF)
const TIME_OPTIONS = (() => {
  const arr = ["OFF"];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      arr.push(`${hh}:${mm}`);
    }
  }
  return arr;
})();

const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

function getAirlineColor(airline) {
  const a = String(airline || "").trim();

  // ✅ Si coincide exacto con alguno, úsalo
  if (AIRLINE_COLORS[a]) return AIRLINE_COLORS[a];

  // ✅ WL: cualquier variante "WL ..." usa el color WL genérico
  // Ejemplos: "WL Havana Air", "WL Charter", "WL Something"
  if (/^WL\b/i.test(a)) return AIRLINE_COLORS.WL;

  // fallback
  return "#e5e7eb";
}

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers,
  onSave,
  onSaveDraft,
  approved = false,
  blockedByEmployee = {},
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const headerColor = getAirlineColor(airline);

  // ✅ Remover fila completa
  const removeRow = (rowIndex) => {
    if (readonly || approved) return;

    const empId = rows?.[rowIndex]?.employeeId;
    const emp = employees.find((e) => e.id === empId);
    const empName = emp?.name ? ` (${emp.name})` : "";

    const ok = window.confirm(
      `Remove this employee row${empName}?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  // 🔧 Actualizar una celda (día + shiftIndex)
  const updateShift = (rowIndex, day, shiftIndex, field, value) => {
    if (readonly) return;

    setRows((prev) => {
      const copy = [...prev];
      const row = { ...copy[rowIndex] };
      const current = Array.isArray(row[day]) ? [...row[day]] : [];

      if (!current[shiftIndex]) {
        current[shiftIndex] = { start: "", end: "" };
      }

      if (field === "start" && value === "OFF") {
        current[shiftIndex].start = "OFF";
        current[shiftIndex].end = "";
      } else {
        current[shiftIndex][field] = value;
      }

      row[day] = current;
      copy[rowIndex] = row;
      return copy;
    });
  };

  // 🔧 Render de una celda tipo Excel (un turno)
  const renderShiftCell = (row, rowIndex, day, shiftIndex) => {
    const shifts = row[day] || [];
    const shift = shifts[shiftIndex] || { start: "", end: "" };

    const hasData = shift.start || shift.end;
    const isOff = shift.start === "OFF";

    const empBlockedDays = blockedByEmployee[row.employeeId] || {};
    const isBlockedDay = !!empBlockedDays[day];

    let bgColor = hasData || isOff ? headerColor : "#ffffff";
    let extraClass = "";

    if (isBlockedDay) {
      bgColor = "#fee2e2";
      extraClass = " sch-cell-blocked";
    }

    const text = shift.start
      ? shift.start === "OFF"
        ? "OFF"
        : `${shift.start}${shift.end ? ` - ${shift.end}` : ""}`
      : "";

    if (readonly) {
      return (
        <td
          key={`${day}-${shiftIndex}`}
          className={`sch-cell${extraClass}`}
          style={{ backgroundColor: bgColor, position: "relative" }}
        >
          {isBlockedDay && shiftIndex === 0 && (
            <span className="sch-blocked-tag">BLOCKED</span>
          )}
          {text}
        </td>
      );
    }

    return (
      <td
        key={`${day}-${shiftIndex}`}
        className={`sch-cell${extraClass}`}
        style={{ backgroundColor: bgColor, position: "relative" }}
      >
        {isBlockedDay && shiftIndex === 0 && (
          <span className="sch-blocked-tag">BLOCKED</span>
        )}

        <div className="sch-cell-select-row">
          <select
            className="sch-select"
            value={shift.start || ""}
            onChange={(e) =>
              updateShift(rowIndex, day, shiftIndex, "start", e.target.value)
            }
          >
            <option value="">Start</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {shift.start !== "OFF" && (
            <select
              className="sch-select"
              value={shift.end || ""}
              onChange={(e) =>
                updateShift(rowIndex, day, shiftIndex, "end", e.target.value)
              }
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
      </td>
    );
  };

  const addRow = () => {
    if (readonly) return;
    setRows((prev) => [
      ...prev,
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

  return (
    <div className={`sch-wrapper ${approved ? "sch-wrapper-approved" : ""}`}>
      <div className="sch-title" style={{ color: headerColor }}>
        {airline || "AIRLINE"}
      </div>
      <div className="sch-subtitle">{department || "Department"}</div>

      <div className="sch-table-container">
        <table className="sch-table">
          <thead>
            <tr>
              <th className="sch-header sch-header-employee">EMPLOYEE</th>
              {days.map((d) => (
                <th
                  key={d}
                  className="sch-header"
                  style={{ backgroundColor: headerColor }}
                >
                  {DAY_LABELS[d]} {dayNumbers?.[d] ? `/ ${dayNumbers[d]}` : ""}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const emp = employees.find((e) => e.id === row.employeeId);
              const empName = emp?.name || "";

              return (
                <React.Fragment key={rowIndex}>
                  <tr>
                    <td className="sch-employee-cell" rowSpan={2}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        {!readonly ? (
                          <select
                            className="sch-employee-select"
                            value={row.employeeId || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRows((prev) => {
                                const copy = [...prev];
                                copy[rowIndex] = { ...copy[rowIndex], employeeId: value };
                                return copy;
                              });
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
                          <span>{empName}</span>
                        )}

                        {!readonly && !approved && (
                          <button
                            type="button"
                            onClick={() => removeRow(rowIndex)}
                            title="Remove this row"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.18)",
                              background: "rgba(255,0,0,0.12)",
                              color: "inherit",
                              cursor: "pointer",
                              fontWeight: 800,
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>

                    {days.map((day) => renderShiftCell(row, rowIndex, day, 0))}
                  </tr>

                  <tr>
                    {days.map((day) => renderShiftCell(row, rowIndex, day, 1))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readonly && !approved && (
        <button onClick={addRow} className="sch-add-row-btn">
          + Add employee row
        </button>
      )}

      {!readonly && !approved && (
        <div className="sch-submit-row">
          {onSaveDraft && (
            <button type="button" onClick={onSaveDraft} className="sch-draft-btn">
              Save as Draft
            </button>
          )}
          {onSave && (
            <button onClick={onSave} className="sch-submit-btn">
              Submit for approval
            </button>
          )}
        </div>
      )}
    </div>
  );
}
