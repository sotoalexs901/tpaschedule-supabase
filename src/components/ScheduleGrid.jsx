// src/components/ScheduleGrid.jsx
import React from "react";

// 🎨 Colores por aerolínea
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

  // ✅ Nuevo color WestJet: verde-azul claro
  WestJet: "#22B8B0",
};

// 🖼️ Logos por aerolínea
const AIRLINE_LOGOS = {
  WestJet: "/logos/westjet.png",
};

// ⏰ Opciones de hora
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

function normalizeAirlineName(name) {
  const value = String(name || "").trim();

  if (
    value.toUpperCase() === "WAL HAVANA AIR" ||
    value.toUpperCase() === "WAL" ||
    value.toUpperCase() === "WAL HAVANA"
  ) {
    return "WestJet";
  }

  return value;
}

function getAirlineColor(airline) {
  const normalized = normalizeAirlineName(airline);

  if (AIRLINE_COLORS[normalized]) return AIRLINE_COLORS[normalized];
  if (/^WL\b/i.test(normalized)) return AIRLINE_COLORS.WL;

  return "#6b7280";
}

function getAirlineLogo(airline) {
  const normalized = normalizeAirlineName(airline);
  return AIRLINE_LOGOS[normalized] || null;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const num = parseInt(normalized, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function lightenColor(hex, amount = 0.86) {
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

function transparentize(hex, alpha = 0.12) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  const displayAirline = normalizeAirlineName(airline);
  const airlineLogo = getAirlineLogo(airline);

  const headerColor = getAirlineColor(airline);
  const headerSoft = lightenColor(headerColor, 0.78);
  const rowSoft = lightenColor(headerColor, 0.9);
  const employeeSoft = lightenColor(headerColor, 0.84);
  const borderSoft = transparentize(headerColor, 0.28);
  const accentSoft = transparentize(headerColor, 0.16);

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

  const renderReadonlyText = (shift) => {
    if (!shift?.start) return "";
    if (shift.start === "OFF") return "OFF";
    return `${shift.start}${shift.end ? ` - ${shift.end}` : ""}`;
  };

  const renderShiftCell = (row, rowIndex, day, shiftIndex) => {
    const shifts = row[day] || [];
    const shift = shifts[shiftIndex] || { start: "", end: "" };

    const hasData = shift.start || shift.end;
    const isOff = shift.start === "OFF";

    const empBlockedDays = blockedByEmployee[row.employeeId] || {};
    const isBlockedDay = !!empBlockedDays[day];

    let bgColor = hasData || isOff ? accentSoft : "rgba(255,255,255,0.78)";
    let borderColor = borderSoft;
    let extraClass = "";

    if (isBlockedDay) {
      bgColor = "#fee2e2";
      borderColor = "#fca5a5";
      extraClass = " sch-cell-blocked";
    }

    if (readonly) {
      return (
        <td
          key={`${day}-${shiftIndex}`}
          className={`sch-cell${extraClass}`}
          style={{
            backgroundColor: bgColor,
            position: "relative",
            border: `1px solid ${borderColor}`,
            minWidth: 118,
            verticalAlign: "middle",
            textAlign: "center",
            fontWeight: 600,
            color: "#1f2937",
            padding: "10px 8px",
          }}
        >
          {isBlockedDay && shiftIndex === 0 && (
            <span className="sch-blocked-tag">BLOCKED</span>
          )}
          {renderReadonlyText(shift)}
        </td>
      );
    }

    return (
      <td
        key={`${day}-${shiftIndex}`}
        className={`sch-cell${extraClass}`}
        style={{
          backgroundColor: bgColor,
          position: "relative",
          border: `1px solid ${borderColor}`,
          minWidth: 118,
          padding: 8,
          verticalAlign: "middle",
        }}
      >
        {isBlockedDay && shiftIndex === 0 && (
          <span className="sch-blocked-tag">BLOCKED</span>
        )}

        <div
          className="sch-cell-select-row"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <select
            className="sch-select"
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(209,213,219,0.95)",
              borderRadius: 10,
              padding: "8px 10px",
              color: "#111827",
              fontWeight: 600,
              outline: "none",
            }}
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
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(209,213,219,0.95)",
                borderRadius: 10,
                padding: "8px 10px",
                color: "#111827",
                fontWeight: 600,
                outline: "none",
              }}
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
    <div
      className={`sch-wrapper ${approved ? "sch-wrapper-approved" : ""}`}
      style={{
        background: "#ffffff",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        border: "1px solid rgba(229,231,235,0.9)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {airlineLogo && (
          <img
            src={airlineLogo}
            alt={displayAirline}
            style={{
              height: 42,
              width: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        )}

        <div
          className="sch-title"
          style={{
            color: headerColor,
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: 0.4,
            marginBottom: 0,
          }}
        >
          {displayAirline || "AIRLINE"}
        </div>
      </div>

      <div
        className="sch-subtitle"
        style={{
          color: "#4b5563",
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        {department || "Department"}
      </div>

      <div
        className="sch-table-container"
        style={{
          overflowX: "auto",
          borderRadius: 16,
          border: "1px solid rgba(229,231,235,0.9)",
        }}
      >
        <table
          className="sch-table"
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            background: "#fff",
          }}
        >
          <thead>
            <tr>
              <th
                className="sch-header sch-header-employee"
                style={{
                  background: "#f8fafc",
                  color: "#111827",
                  fontWeight: 800,
                  padding: "14px 12px",
                  borderBottom: `1px solid ${borderSoft}`,
                  minWidth: 220,
                  textAlign: "left",
                }}
              >
                EMPLOYEE
              </th>

              {days.map((d) => (
                <th
                  key={d}
                  className="sch-header"
                  style={{
                    backgroundColor: headerColor,
                    color: "#ffffff",
                    padding: "14px 10px",
                    borderBottom: `1px solid ${borderSoft}`,
                    minWidth: 120,
                    textAlign: "center",
                    fontWeight: 800,
                    letterSpacing: 0.4,
                  }}
                >
                  <div>{DAY_LABELS[d]}</div>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.95,
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {dayNumbers?.[d] ? dayNumbers[d] : ""}
                  </div>
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
                  <tr
                    style={{
                      backgroundColor: rowSoft,
                    }}
                  >
                    <td
                      className="sch-employee-cell"
                      rowSpan={2}
                      style={{
                        background: employeeSoft,
                        borderRight: `1px solid ${borderSoft}`,
                        borderBottom: `1px solid ${borderSoft}`,
                        padding: 12,
                        minWidth: 220,
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        {!readonly ? (
                          <div style={{ width: "100%" }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                color: "#6b7280",
                                marginBottom: 6,
                              }}
                            >
                              EMPLOYEE NAME
                            </div>
                            <select
                              className="sch-employee-select"
                              style={{
                                width: "100%",
                                background: "rgba(255,255,255,0.94)",
                                border: `1px solid ${borderSoft}`,
                                borderRadius: 12,
                                padding: "10px 12px",
                                color: "#111827",
                                fontWeight: 700,
                                outline: "none",
                              }}
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
                              <option value="">Select employee</option>
                              {employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                color: "#6b7280",
                              }}
                            >
                              EMPLOYEE NAME
                            </span>
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 800,
                                color: "#111827",
                              }}
                            >
                              {empName || "Unassigned"}
                            </span>
                          </div>
                        )}

                        {!readonly && !approved && (
                          <button
                            type="button"
                            onClick={() => removeRow(rowIndex)}
                            title="Remove this row"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 10,
                              border: "1px solid rgba(239,68,68,0.18)",
                              background: "rgba(239,68,68,0.10)",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontWeight: 800,
                              lineHeight: 1,
                              flexShrink: 0,
                              marginLeft: 8,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>

                    {days.map((day) => renderShiftCell(row, rowIndex, day, 0))}
                  </tr>

                  <tr
                    style={{
                      backgroundColor: rowSoft,
                    }}
                  >
                    {days.map((day) => renderShiftCell(row, rowIndex, day, 1))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readonly && !approved && (
        <button
          onClick={addRow}
          className="sch-add-row-btn"
          style={{
            marginTop: 16,
            background: headerSoft,
            color: headerColor,
            border: `1px solid ${borderSoft}`,
            borderRadius: 12,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          + Add employee row
        </button>
      )}

      {!readonly && !approved && (
        <div
          className="sch-submit-row"
          style={{
            display: "flex",
            gap: 12,
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              className="sch-draft-btn"
              style={{
                background: "#ffffff",
                color: "#374151",
                border: "1px solid rgba(209,213,219,1)",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save as Draft
            </button>
          )}

          {onSave && (
            <button
              onClick={onSave}
              className="sch-submit-btn"
              style={{
                background: headerColor,
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
              }}
            >
              Submit for approval
            </button>
          )}
        </div>
      )}
    </div>
  );
}
