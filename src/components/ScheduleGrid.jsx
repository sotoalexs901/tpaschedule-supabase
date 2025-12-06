import React from "react";

// 🎨 Colores por aerolínea (igual que antes)
const AIRLINE_COLORS = {
  SY: "#F28C28",
  "WL Havana Air": "#3A7BD5",
  "WL Invicta": "#0057B8",
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

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers,
  onSave,
  onSaveDraft,   // ✅ para drafts
  approved = false,
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const headerColor = AIRLINE_COLORS[airline] || "#e5e7eb";

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
    const bgColor = hasData || isOff ? headerColor : "#ffffff";

    const text = shift.start
      ? shift.start === "OFF"
        ? "OFF"
        : `${shift.start}${shift.end ? ` - ${shift.end}` : ""}`
      : "";

    if (readonly) {
      return (
        <td
          key={`${day}-${shiftIndex}`}
          className="sch-cell"
          style={{ backgroundColor: bgColor }}
        >
          {text}
        </td>
      );
    }

    return (
      <td
        key={`${day}-${shiftIndex}`}
        className="sch-cell"
        style={{ backgroundColor: bgColor }}
      >
        <div className="sch-cell-select-row">
          {/* START */}
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

          {/* END (solo si no es OFF) */}
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
      {/* TÍTULO TIPO EXCEL */}
      <div className="sch-title" style={{ color: headerColor }}>
        {airline || "AIRLINE"}
      </div>
      <div className="sch-subtitle">{department || "Department"}</div>

      {/* TABLA ESTILO EXCEL */}
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
                  {/* Fila 1 – Primer turno */}
                  <tr>
                    {/* Celda de empleado con rowSpan=2 */}
                    <td className="sch-employee-cell" rowSpan={2}>
                      {!readonly ? (
                        <select
                          className="sch-employee-select"
                          value={row.employeeId || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRows((prev) => {
                              const copy = [...prev];
                              copy[rowIndex] = {
                                ...copy[rowIndex],
                                employeeId: value,
                              };
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
                        empName
                      )}
                    </td>

                    {/* Celdas día – shift 1 */}
                    {days.map((day) => renderShiftCell(row, rowIndex, day, 0))}
                  </tr>

                  {/* Fila 2 – Segundo turno */}
                  <tr>
                    {days.map((day) => renderShiftCell(row, rowIndex, day, 1))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* BOTÓN ADD ROW */}
      {!readonly && !approved && (
        <button onClick={addRow} className="sch-add-row-btn">
          + Add employee row
        </button>
      )}

      {/* BOTONES SUBMIT / DRAFT */}
      {!readonly && !approved && (
        <div className="sch-submit-row">
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              className="sch-draft-btn"
            >
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
