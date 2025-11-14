import React from "react";
import ScheduleCell from "./ScheduleCell";

// ⭐ Logos por aerolínea (URLs reales desde Firebase Storage)
const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  "WL Havana Air":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2006_28_07%20p.m..png?alt=media&token=7bcf90fd-c854-400e-a28a-f838adca89f4",
  "WL Invicta":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_49%20p.m..png?alt=media&token=092a1deb-3285-41e1-ab0c-2e48a8faab92",
  AV: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_37%20p.m..png?alt=media&token=f133d1c8-51f9-4513-96df-8a75c6457b5b",
  EA: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_41%20p.m..png?alt=media&token=13fe584f-078f-4073-8d92-763ac549e5eb",
  WCHR:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_32%20p.m..png?alt=media&token=4f7e9ddd-692b-4288-af0a-8027a1fc6e1c",
  CABIN:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_28%20p.m..png?alt=media&token=b269ad02-0761-4b6b-b2f1-b510365cce49",
  "AA-BSO":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_25%20p.m..png?alt=media&token=09862a10-d237-43e9-a373-8bd07c30ce62",
  OTHER:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4d5f-b126-9c6a69f6dcc6",
};

// ⭐ Colores por aerolínea
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

export default function ScheduleGrid({
  employees,
  rows,
  setRows,
  readonly = false,
  airline,
  department,
  dayNumbers,
  onSave,
  approved = false,
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  const headerColor = AIRLINE_COLORS[airline] || "#e5e7eb";
  const logo = AIRLINE_LOGOS[airline];

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
    <div
      className={`border bg-white ${
        approved ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      {/* 🔵 LOGO + HEADER */}
      <div
        className="grid grid-cols-9 font-bold text-sm text-center p-2 border-b items-center"
        style={{ backgroundColor: headerColor, color: "white" }}
      >
        <div className="flex flex-col items-center justify-center">
          {logo && (
            <img src={logo} alt={airline} className="h-10 object-contain mb-1" />
          )}
          <div className="text-xs font-normal mt-1">
            {airline || "Select airline"} — {department || "Department"}
          </div>
        </div>

        {days.map((d) => (
          <div key={d} className="uppercase">
            {d}
            <br />
            <span className="text-xs font-normal">{dayNumbers[d] || ""}</span>
          </div>
        ))}
      </div>

      {/* 🔵 FILAS */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-9 border-b text-center items-stretch"
        >
          {/* EMPLOYEE SELECT */}
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

          {/* DÍAS */}
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

      {/* 🔵 ADD ROW */}
      {!readonly && !approved && (
        <button
          onClick={addRow}
          className="w-full bg-blue-600 text-white py-2 mt-2 text-sm"
        >
          + Add employee row
        </button>
      )}

      {/* 🔵 SUBMIT */}
      {!readonly && onSave && !approved && (
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
