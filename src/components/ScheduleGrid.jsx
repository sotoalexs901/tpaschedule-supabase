import React from "react";
import ScheduleCell from "./ScheduleCell";

// Colores por aerolínea (tabla estilo Excel)
const AIRLINE_COLORS = {
  SY: "#F28C28",      // Sun Country - naranja
  AV: "#D22630",      // Avianca - rojo
  WL: "#3A7BD5",      // WL - azul
  EA: "#003E7E",      // Eastern - azul oscuro
  WCHR: "#7D39C7",    // WCHR - morado
  CABIN: "#1FA86A",   // Cabin Service - verde
  "AA-BSO": "#A8A8A8",// AA BSO - gris
  OTHER: "#555555"    // Otras - gris neutro
};

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers,
  onSave
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  const headerColor = AIRLINE_COLORS[airline] || "#e5e7eb";

  const addRow = () => {
    if (readonly) return;
    setRows([
      ...rows,
      {
        employeeId: "",
        mon: [{ start: "", end: "" }],
        tue: [{ start: "", end: "" }],
        wed: [{ start: "", end: "" }],
        thu: [{ start: "", end: "" }],
        fri: [{ start: "", end: "" }],
        sat: [{ start: "", end: "" }],
        sun: [{ start: "", end: "" }],
      },
    ]);
  };

  return (
    <div className="border bg-white">
      {/* HEADER SUPERIOR CON COLOR POR AEROLÍNEA */}
      <div
        className="grid grid-cols-9 font-bold text-sm text-center p-2 border-b"
        style={{ backgroundColor: headerColor, color: "white" }}
      >
        <div>
          EMPLOYEE
          <div className="text-[11px] font-normal mt-1">
            {airline || "Select airline"} — {department || "Department"}
          </div>
        </div>
        {days.map((d) => (
          <div key={d} className="uppercase">
            {d}
            <br />
            <span className="text-xs font-normal">
              {dayNumbers[d] || ""}
            </span>
          </div>
        ))}
      </div>

      {/* FILAS DEL GRID */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-9 border-b text-center items-stretch"
        >
          {/* Columna de empleado */}
          <div className="p-1 flex items-center">
            {!readonly ? (
              <select
                className="border w-full p-1 text-sm"
                value={row.employeeId}
                onChange={(e) => {
                  const updated = [...rows];
                  updated[idx].employeeId = e.target.value;
                  setRows(updated);
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
              <div className="text-sm font-medium">
                {employees.find((x) => x.id === row.employeeId)?.name ||
                  "Unknown"}
              </div>
            )}
          </div>

          {/* Celdas por día (con hasta 2 shifts) */}
          {days.map((day) => (
            <ScheduleCell
              key={day}
              day={day}
              row={row}
              rowIndex={idx}
              rows={rows}
              setRows={setRows}
              readonly={readonly}
            />
          ))}
        </div>
      ))}

      {/* Botón para agregar fila */}
      {!readonly && (
        <button
          onClick={addRow}
          className="w-full bg-blue-600 text-white py-2 mt-2 text-sm"
        >
          + Add employee row
        </button>
      )}

      {/* Botón de SUBMIT PARA APROBACIÓN (Duty Managers) */}
      {!readonly && onSave && (
        <div className="p-3 border-t flex justify-end">
          <button
            onClick={onSave}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold"
          >
            Submit for approval
          </button>
        </div>
      )}
    </div>
  );
}
