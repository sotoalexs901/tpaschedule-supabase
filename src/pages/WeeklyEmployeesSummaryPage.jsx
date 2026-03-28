// src/pages/WeeklyEmployeesSummaryPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const AIRLINES_ORDER = [
  "WestJet",
  "WL Invicta",
  "AV",
  "AA-BSO",
  "CABIN",
  "WCHR",
  "SY",
  "OTHER",
];

const normalizeAirlineName = (value) => {
  const airline = String(value || "").trim();

  if (
    airline.toUpperCase() === "WL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA" ||
    airline.toUpperCase() === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
};

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

export default function WeeklyEmployeesSummaryPage() {
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [weekTags, setWeekTags] = useState([]);
  const [selectedWeekTag, setSelectedWeekTag] = useState("");
  const [summaryByAirline, setSummaryByAirline] = useState({});
  const [statusFilter, setStatusFilter] = useState("approved");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const schSnap = await getDocs(collection(db, "schedules"));

        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const schList = schSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSchedules(schList);
      } catch (err) {
        console.error("Error loading weekly summary data:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, []);

  const scheduleMatchesStatus = (s) => {
    if (!s.status) return false;
    if (statusFilter === "both") {
      return s.status === "approved" || s.status === "draft";
    }
    return s.status === statusFilter;
  };

  useEffect(() => {
    const filteredByStatus = schedules.filter(scheduleMatchesStatus);
    const tags = Array.from(
      new Set(filteredByStatus.map((s) => s.weekTag).filter(Boolean))
    ).sort();

    setWeekTags(tags);

    if (!tags.includes(selectedWeekTag)) {
      setSelectedWeekTag(tags[0] || "");
    }
  }, [schedules, statusFilter, selectedWeekTag]);

  useEffect(() => {
    if (!selectedWeekTag || schedules.length === 0) {
      setSummaryByAirline({});
      return;
    }

    const filtered = schedules.filter(
      (s) => s.weekTag === selectedWeekTag && scheduleMatchesStatus(s)
    );

    const summary = {};

    filtered.forEach((sch) => {
      const airline = normalizeAirlineName(
        sch.airlineDisplayName || sch.airline || "Unknown"
      );
      if (!summary[airline]) summary[airline] = {};

      const totals = sch.totals || {};
      Object.entries(totals).forEach(([employeeId, hours]) => {
        const h = typeof hours === "number" ? hours : Number(hours || 0);
        if (!summary[airline][employeeId]) {
          summary[airline][employeeId] = 0;
        }
        summary[airline][employeeId] += h;
      });
    });

    setSummaryByAirline(summary);
  }, [selectedWeekTag, schedules, statusFilter]);

  const formatWeekLabel = (tag) => {
    const sample = schedules.find(
      (s) => s.weekTag === tag && scheduleMatchesStatus(s)
    );
    if (!sample || !sample.days) return tag || "No week selected";

    return DAY_KEYS.map((key) => {
      const label = DAY_LABELS[key];
      const num = sample.days[key];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  const airlineKeys = Object.keys(summaryByAirline).sort();

  const statusLabel =
    statusFilter === "approved"
      ? "Approved only"
      : statusFilter === "draft"
      ? "Draft only"
      : "Approved + Draft";

  if (loading) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading weekly summary...
        </p>
      </PageCard>
    );
  }

  const filteredSchedulesCount = schedules.filter(scheduleMatchesStatus).length;

  if (filteredSchedulesCount === 0) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          There are no <b>{statusFilter}</b> schedules to build a weekly summary.
        </p>
      </PageCard>
    );
  }

  if (weekTags.length === 0) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          There are no schedules with week tags for the selected filter.
        </p>
      </PageCard>
    );
  }

  const totalAllAirlines = Object.values(summaryByAirline)
    .flatMap((air) => Object.values(air))
    .reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Weekly Summary
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Weekly Employees Summary
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              View total hours per employee and per airline for a selected week.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <SelectInput
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="approved">Approved</option>
              <option value="draft">Draft</option>
              <option value="both">Approved + Draft</option>
            </SelectInput>

            <SelectInput
              value={selectedWeekTag}
              onChange={(e) => setSelectedWeekTag(e.target.value)}
              style={{ minWidth: 280 }}
            >
              {weekTags.map((tag) => (
                <option key={tag} value={tag}>
                  {formatWeekLabel(tag)}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </div>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Selected Week
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                lineHeight: 1.5,
              }}
            >
              {formatWeekLabel(selectedWeekTag)}
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Status Filter
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 18,
                fontWeight: 800,
                color: "#1769aa",
                letterSpacing: "-0.02em",
              }}
            >
              {statusLabel}
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Total Weekly Hours
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              {totalAllAirlines.toFixed(2)}
            </p>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Week of: {formatWeekLabel(selectedWeekTag)}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Empty cells mean the employee has 0 hours for that airline in the
            selected week and status filter.
          </p>
        </div>

        {airlineKeys.length === 0 ? (
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No data for the selected week and status filter.
          </p>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 980,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle({ textAlign: "left" })}>Employee Name</th>

                  {AIRLINES_ORDER.map((air) => (
                    <th key={air} style={thStyle({ textAlign: "center" })}>
                      {air}
                    </th>
                  ))}

                  <th style={thStyle({ textAlign: "center" })}>
                    Total Weekly Hours
                  </th>
                </tr>
              </thead>

              <tbody>
                {employees
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((emp, rowIndex) => {
                    const rowHours = {
                      WestJet: summaryByAirline["WestJet"]?.[emp.id] || 0,
                      "WL Invicta":
                        summaryByAirline["WL Invicta"]?.[emp.id] || 0,
                      AV: summaryByAirline["AV"]?.[emp.id] || 0,
                      "AA-BSO": summaryByAirline["AA-BSO"]?.[emp.id] || 0,
                      CABIN: summaryByAirline["CABIN"]?.[emp.id] || 0,
                      WCHR: summaryByAirline["WCHR"]?.[emp.id] || 0,
                      SY: summaryByAirline["SY"]?.[emp.id] || 0,
                      OTHER: summaryByAirline["OTHER"]?.[emp.id] || 0,
                    };

                    const total = Object.values(rowHours).reduce(
                      (a, b) => a + b,
                      0
                    );

                    if (total === 0) return null;

                    return (
                      <tr
                        key={emp.id}
                        style={{
                          background:
                            rowIndex % 2 === 0 ? "#ffffff" : "#fbfdff",
                        }}
                      >
                        <td style={tdStyle}>{emp.name}</td>

                        {AIRLINES_ORDER.map((air) => {
                          const h = rowHours[air] || 0;
                          return (
                            <td
                              key={air}
                              style={{ ...tdStyle, textAlign: "center" }}
                            >
                              {h === 0 ? "" : h.toFixed(2)}
                            </td>
                          );
                        })}

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          {total.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}

                <tr
                  style={{
                    background: "#f8fbff",
                    fontWeight: 800,
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 800 }}>
                    TOTAL HOURS PER AIRLINE
                  </td>

                  {AIRLINES_ORDER.map((air) => {
                    const total = Object.values(
                      summaryByAirline[normalizeAirlineName(air)] ||
                        summaryByAirline[air] ||
                        {}
                    ).reduce((sum, h) => sum + h, 0);

                    return (
                      <td
                        key={air}
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
                        }}
                      >
                        {total === 0 ? "" : total.toFixed(2)}
                      </td>
                    );
                  })}

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 800,
                    }}
                  >
                    {totalAllAirlines.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
