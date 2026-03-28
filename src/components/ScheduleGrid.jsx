import React from "react";

const AIRLINE_COLORS = {
  SY: "#F28C28",
  WL: "#3A7BD5",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
  WestJet: "#22B8B0",
};

const AIRLINE_LOGOS = {
  WestJet: "/logos/westjet.png",
};

const TIME_OPTIONS = (() => {
  const arr = ["OFF"];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
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

function normalizeAirlineName(name) {
  const value = String(name || "").trim().toUpperCase();
  if (
    ["WAL HAVANA AIR", "WAL", "WAL HAVANA", "WL HAVANA AIR", "WESTJET"].includes(
      value
    )
  ) {
    return "WestJet";
  }
  return name;
}

function getAirlineColor(airline) {
  return AIRLINE_COLORS[normalizeAirlineName(airline)] || "#6b7280";
}

function getAirlineLogo(airline) {
  return AIRLINE_LOGOS[normalizeAirlineName(airline)] || null;
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
}) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  const headerColor = getAirlineColor(airline);
  const airlineLogo = getAirlineLogo(airline);

  const updateShift = (rowIndex, day, shiftIndex, field, value) => {
    if (readonly) return;

    setRows((prev) => {
      const copy = [...prev];
      const row = { ...copy[rowIndex] };
      const shifts = [...(row[day] || [])];

      if (!shifts[shiftIndex]) shifts[shiftIndex] = {};

      if (value === "OFF") {
        shifts[shiftIndex] = { start: "OFF", end: "" };
      } else {
        shifts[shiftIndex][field] = value;
      }

      row[day] = shifts;
      copy[rowIndex] = row;
      return copy;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        employeeId: "",
        mon: [{}, {}],
        tue: [{}, {}],
        wed: [{}, {}],
        thu: [{}, {}],
        fri: [{}, {}],
        sat: [{}, {}],
        sun: [{}, {}],
      },
    ]);
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow">
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-4">
        {airlineLogo && (
          <img src={airlineLogo} alt="" className="h-10" />
        )}
        <div>
          <h2 style={{ color: headerColor }} className="text-xl font-bold">
            {airline}
          </h2>
          <p className="text-sm text-gray-500">{department}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                style={{
                  width: 420,
                  minWidth: 420,
                  maxWidth: 420,
                }}
                className="text-left p-3 bg-gray-100"
              >
                EMPLOYEE
              </th>

              {days.map((d) => (
                <th
                  key={d}
                  className="text-center p-3 text-white font-bold"
                  style={{ background: headerColor }}
                >
                  {DAY_LABELS[d]}
                  <div className="text-xs mt-1">
                    {dayNumbers?.[d] || ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const emp = employees.find((e) => e.id === row.employeeId);

              return (
                <tr key={i}>
                  {/* EMPLOYEE CELL */}
                  <td
                    style={{
                      width: 420,
                      minWidth: 420,
                      maxWidth: 420,
                    }}
                    className="p-3 border"
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 34px",
                        gap: 8,
                      }}
                    >
                      {!readonly ? (
                        <select
                          value={row.employeeId || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) => {
                              const copy = [...prev];
                              copy[i].employeeId = val;
                              return copy;
                            });
                          }}
                          style={{
                            width: "100%",
                            fontSize: 16,
                            padding: "10px",
                            fontWeight: 700,
                          }}
                        >
                          <option value="">Select employee</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="font-bold text-sm">
                          {emp?.name || "Unassigned"}
                        </div>
                      )}

                      {!readonly && (
                        <button
                          onClick={() =>
                            setRows((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="bg-red-100 text-red-600 rounded"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>

                  {/* DAYS */}
                  {days.map((d) => (
                    <td key={d} className="p-2 border text-center">
                      <select
                        value={row[d]?.[0]?.start || ""}
                        onChange={(e) =>
                          updateShift(i, d, 0, "start", e.target.value)
                        }
                      >
                        <option value="">Start</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <select
                        value={row[d]?.[0]?.end || ""}
                        onChange={(e) =>
                          updateShift(i, d, 0, "end", e.target.value)
                        }
                      >
                        <option value="">End</option>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <button
          onClick={addRow}
          className="mt-4 px-4 py-2 bg-gray-200 rounded font-semibold"
        >
          + Add employee
        </button>
      )}
    </div>
  );
}
