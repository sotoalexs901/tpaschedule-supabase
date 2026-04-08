import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: "#ffffff",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: "#ffffff",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 20,
          fontWeight: 900,
          color: current.color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function getStartOfWeek(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

function sameMonth(dateStr, month) {
  return String(dateStr || "").slice(0, 7) === month;
}

function sameWeek(dateStr, weekStart) {
  return getStartOfWeek(dateStr) === weekStart;
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function GateChecklistManagementPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    airline: "all",
    flight: "",
    date: "",
    weekStart: "",
    month: "",
    periodType: "day",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const snap = await getDocs(
          query(collection(db, "gateChecklistReports"), orderBy("createdAt", "desc"))
        );

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (error) {
        console.error("Error loading gate checklist reports:", error);
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (filters.airline !== "all" && item.airline !== filters.airline) {
        return false;
      }

      if (
        filters.flight &&
        !String(item.flight || "")
          .toLowerCase()
          .includes(filters.flight.toLowerCase().trim())
      ) {
        return false;
      }

      if (filters.periodType === "day" && filters.date) {
        if (item.date !== filters.date) return false;
      }

      if (filters.periodType === "week" && filters.weekStart) {
        if (!sameWeek(item.date, filters.weekStart)) return false;
      }

      if (filters.periodType === "month" && filters.month) {
        if (!sameMonth(item.date, filters.month)) return false;
      }

      return true;
    });
  }, [reports, filters]);

  const otpByAirline = useMemo(() => {
    const map = {};

    filteredReports.forEach((item) => {
      const airline = item.airline || "N/A";
      if (!map[airline]) {
        map[airline] = {
          flights: 0,
          otpFlights: 0,
          totalCheckedBags: 0,
          totalNotLoadedBags: 0,
        };
      }

      map[airline].flights += 1;
      map[airline].totalCheckedBags += safeNumber(item.checkedBags);
      map[airline].totalNotLoadedBags += safeNumber(item.notLoadedBags);

      if (item.isOtpDeparture === true) {
        map[airline].otpFlights += 1;
      }
    });

    return Object.entries(map).map(([airline, data]) => ({
      airline,
      ...data,
      otpPercent:
        data.flights > 0 ? ((data.otpFlights / data.flights) * 100).toFixed(2) : "0.00",
    }));
  }, [filteredReports]);

  const totals = useMemo(() => {
    const flights = filteredReports.length;
    const otpFlights = filteredReports.filter(
      (item) => item.isOtpDeparture === true
    ).length;
    const checkedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.checkedBags),
      0
    );
    const notLoadedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.notLoadedBags),
      0
    );

    return {
      flights,
      otpFlights,
      otpPercent:
        flights > 0 ? ((otpFlights / flights) * 100).toFixed(2) : "0.00",
      checkedBags,
      notLoadedBags,
    };
  }, [filteredReports]);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 24,
          padding: 24,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            opacity: 0.85,
          }}
        >
          TPA OPS · Gate Checklist Management
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          Gate Checklist Management / OTP Reports
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 960,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          Filter by flight, airline, day, week or month, and track OTP,
          checked bags, and not loaded bags.
        </p>
      </div>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Period Type</FieldLabel>
            <SelectInput
              value={filters.periodType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, periodType: e.target.value }))
              }
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="SY">SUN COUNTRY (SY)</option>
              <option value="AV">AVIANCA (AV)</option>
              <option value="WL">WORLD ATLANTIC (WL)</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Flight</FieldLabel>
            <TextInput
              value={filters.flight}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, flight: e.target.value }))
              }
              placeholder="Example: SY123"
            />
          </div>

          {filters.periodType === "day" && (
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "week" && (
            <div>
              <FieldLabel>Week Start</FieldLabel>
              <TextInput
                type="date"
                value={filters.weekStart}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, weekStart: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "month" && (
            <div>
              <FieldLabel>Month</FieldLabel>
              <TextInput
                type="month"
                value={filters.month}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, month: e.target.value }))
                }
              />
            </div>
          )}
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <InfoCard label="Flights" value={String(totals.flights)} />
        <InfoCard label="OTP Flights" value={String(totals.otpFlights)} tone="green" />
        <InfoCard label="OTP %" value={`${totals.otpPercent}%`} tone="blue" />
        <InfoCard
          label="Checked Bags"
          value={String(totals.checkedBags)}
          tone="default"
        />
        <InfoCard
          label="Not Loaded Bags"
          value={String(totals.notLoadedBags)}
          tone={totals.notLoadedBags > 0 ? "red" : "green"}
        />
      </div>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            OTP by Airline
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flights</th>
                <th style={thStyle}>OTP Flights</th>
                <th style={thStyle}>OTP %</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded Bags</th>
              </tr>
            </thead>
            <tbody>
              {otpByAirline.length === 0 ? (
                <tr>
                  <td colSpan={6} style={tdStyle}>
                    {loading ? "Loading..." : "No data found."}
                  </td>
                </tr>
              ) : (
                otpByAirline.map((row) => (
                  <tr key={row.airline}>
                    <td style={tdStyle}>{row.airline}</td>
                    <td style={tdStyle}>{row.flights}</td>
                    <td style={tdStyle}>{row.otpFlights}</td>
                    <td style={tdStyle}>{row.otpPercent}%</td>
                    <td style={tdStyle}>{row.totalCheckedBags}</td>
                    <td style={tdStyle}>{row.totalNotLoadedBags}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Submitted Checklists
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>ETD</th>
                <th style={thStyle}>Push</th>
                <th style={thStyle}>OTP</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded</th>
                <th style={thStyle}>Submitted By</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={11} style={tdStyle}>
                    {loading ? "Loading..." : "No reports found."}
                  </td>
                </tr>
              ) : (
                filteredReports.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.date || "-"}</td>
                    <td style={tdStyle}>{item.airline || "-"}</td>
                    <td style={tdStyle}>{item.flight || "-"}</td>
                    <td style={tdStyle}>
                      {item.origin || "-"} - {item.destination || "-"}
                    </td>
                    <td style={tdStyle}>{item.etd || "-"}</td>
                    <td style={tdStyle}>{item.pushTime || "-"}</td>
                    <td style={tdStyle}>
                      {item.isOtpDeparture === true
                        ? "YES"
                        : item.isOtpDeparture === false
                        ? "NO"
                        : "-"}
                    </td>
                    <td style={tdStyle}>{safeNumber(item.checkedBags)}</td>
                    <td style={tdStyle}>{safeNumber(item.notLoadedBags)}</td>
                    <td style={tdStyle}>{item.submittedBy || "-"}</td>
                    <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </div>
  );
}

const tableWrapStyle = {
  overflowX: "auto",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1100,
  background: "#fff",
};

const thStyle = {
  padding: "14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
};
