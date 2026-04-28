import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInputDate(value) {
  const d = toDateSafe(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayDateInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek() {
  const start = startOfWeek();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfDay(dateLike) {
  const d = toDateSafe(dateLike) || new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getRangeDates(range) {
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  if (range === "month") return { start: startOfMonth(), end: endOfMonth() };
  return { start: null, end: null };
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getLetterGrade(value, thresholds) {
  if (value <= thresholds.A) return "A";
  if (value <= thresholds.B) return "B";
  if (value <= thresholds.C) return "C";
  if (value <= thresholds.D) return "D";
  return "F";
}

function average(items, selector) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

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
        boxSizing: "border-box",
        ...props.style,
      }}
    />
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
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function StatCard({ label, value, grade }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
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
          fontSize: 24,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {value}
      </div>

      {grade ? (
        <div
          style={{
            marginTop: 8,
            display: "inline-flex",
            padding: "5px 10px",
            borderRadius: 999,
            background: "#edf7ff",
            border: "1px solid #cfe7fb",
            color: "#1769aa",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          Grade {grade}
        </div>
      ) : null}
    </div>
  );
}

function BarList({ rows, suffix = "" }) {
  if (!rows.length) {
    return <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 700,
              color: "#334155",
            }}
          >
            <span>{row.label}</span>
            <span>
              {row.value.toFixed(2)}
              {suffix}
            </span>
          </div>

          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCountRows(items, getKey, getValue) {
  const map = {};

  items.forEach((item) => {
    const key = getKey(item) || "Unknown";
    if (!map[key]) map[key] = 0;
    map[key] += getValue(item);
  });

  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

const FIRST_BAG_THRESHOLDS = { A: 15, B: 20, C: 25, D: 30 };
const LAST_BAG_THRESHOLDS = { A: 30, B: 40, C: 50, D: 60 };
const SCAN_WINDOW_THRESHOLDS = { A: 20, B: 30, C: 40, D: 50 };
const OHD_BAGS_THRESHOLDS = { A: 0.25, B: 0.5, C: 1, D: 2 };
const FILES_THRESHOLDS = { A: 0.1, B: 0.25, C: 0.5, D: 1 };
const OHD_PERCENT_THRESHOLDS = { A: 10, B: 20, C: 35, D: 50 };
const FILE_PERCENT_THRESHOLDS = { A: 5, B: 10, C: 20, D: 30 };

export default function BSOMgtScoreDashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState("week");
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [selectedAirline, setSelectedAirline] = useState("all");
  const [selectedStation, setSelectedStation] = useState("all");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bso_operations"),
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error loading BSO operations:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (range === "custom") return;
    const { start, end } = getRangeDates(range);
    setFromDate(formatInputDate(start));
    setToDate(formatInputDate(end));
  }, [range]);

  const airlineOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => String(item.airline || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const stationOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => String(item.station || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const activeStartDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const activeEndDate = toDate ? endOfDay(`${toDate}T00:00:00`) : null;

  const filteredRows = useMemo(() => {
    return rows
      .filter((item) => {
        const createdAt = toDateSafe(item.createdAt || item.updatedAt);
        if (!createdAt) return false;
        if (activeStartDate && createdAt < activeStartDate) return false;
        if (activeEndDate && createdAt > activeEndDate) return false;
        if (selectedAirline !== "all" && item.airline !== selectedAirline) return false;
        if (selectedStation !== "all" && item.station !== selectedStation) return false;
        return true;
      })
      .sort((a, b) => {
        const A = toDateSafe(a.createdAt)?.getTime() || 0;
        const B = toDateSafe(b.createdAt)?.getTime() || 0;
        return B - A;
      });
  }, [rows, activeStartDate, activeEndDate, selectedAirline, selectedStation]);

  const totalFlights = filteredRows.length;

  const avgFirstBagMinutes = average(filteredRows, (item) =>
    safeNumber(item.firstBagMinutes)
  );
  const avgLastBagMinutes = average(filteredRows, (item) =>
    safeNumber(item.lastBagMinutes)
  );
  const avgScanWindowMinutes = average(filteredRows, (item) =>
    safeNumber(item.scanWindowMinutes)
  );
  const avgOnHandBagsPerFlight = average(filteredRows, (item) =>
    safeNumber(item.onHandBags)
  );
  const avgFilesPerFlight = average(filteredRows, (item) =>
    safeNumber(item.filesCreated)
  );

  const flightsWithOnHand = filteredRows.filter((item) => safeNumber(item.onHandBags) > 0).length;
  const flightsWithFiles = filteredRows.filter((item) => safeNumber(item.filesCreated) > 0).length;

  const percentFlightsWithOnHand = percent(flightsWithOnHand, totalFlights);
  const percentFlightsWithFiles = percent(flightsWithFiles, totalFlights);

  const gradeFirstBag = getLetterGrade(avgFirstBagMinutes, FIRST_BAG_THRESHOLDS);
  const gradeLastBag = getLetterGrade(avgLastBagMinutes, LAST_BAG_THRESHOLDS);
  const gradeScanWindow = getLetterGrade(avgScanWindowMinutes, SCAN_WINDOW_THRESHOLDS);
  const gradeOhdBags = getLetterGrade(avgOnHandBagsPerFlight, OHD_BAGS_THRESHOLDS);
  const gradeFiles = getLetterGrade(avgFilesPerFlight, FILES_THRESHOLDS);
  const gradeOhdPercent = getLetterGrade(percentFlightsWithOnHand, OHD_PERCENT_THRESHOLDS);
  const gradeFilesPercent = getLetterGrade(percentFlightsWithFiles, FILE_PERCENT_THRESHOLDS);

  const agentRows = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => item.agentName || "Unknown",
        () => 1
      ).slice(0, 10),
    [filteredRows]
  );

  const airlineRows = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => item.airline || "Unknown",
        () => 1
      ).slice(0, 10),
    [filteredRows]
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        maxWidth: 1320,
        margin: "0 auto",
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
          TPA OPS · BSO
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          BSO MGT SCORE DASHBOARD
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 900,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          Score and trend dashboard for On-Hand, files, first bag, last bag, and scan window.
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
            <FieldLabel>Range</FieldLabel>
            <SelectInput value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>From</FieldLabel>
            <TextInput
              type="date"
              value={fromDate}
              onChange={(e) => {
                setRange("custom");
                setFromDate(e.target.value);
              }}
            />
          </div>

          <div>
            <FieldLabel>To</FieldLabel>
            <TextInput
              type="date"
              value={toDate}
              onChange={(e) => {
                setRange("custom");
                setToDate(e.target.value);
              }}
            />
          </div>

          <div>
            <FieldLabel>Station</FieldLabel>
            <SelectInput
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
            >
              <option value="all">All</option>
              {stationOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={selectedAirline}
              onChange={(e) => setSelectedAirline(e.target.value)}
            >
              <option value="all">All</option>
              {airlineOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <StatCard label="Flights" value={String(totalFlights)} />
        <StatCard
          label="Avg First Bag"
          value={`${avgFirstBagMinutes.toFixed(2)} min`}
          grade={gradeFirstBag}
        />
        <StatCard
          label="Avg Last Bag"
          value={`${avgLastBagMinutes.toFixed(2)} min`}
          grade={gradeLastBag}
        />
        <StatCard
          label="Avg Scan Window"
          value={`${avgScanWindowMinutes.toFixed(2)} min`}
          grade={gradeScanWindow}
        />
        <StatCard
          label="Avg OHD / Flight"
          value={avgOnHandBagsPerFlight.toFixed(2)}
          grade={gradeOhdBags}
        />
        <StatCard
          label="Avg Files / Flight"
          value={avgFilesPerFlight.toFixed(2)}
          grade={gradeFiles}
        />
        <StatCard
          label="% Flights With OHD"
          value={`${percentFlightsWithOnHand.toFixed(2)}%`}
          grade={gradeOhdPercent}
        />
        <StatCard
          label="% Flights With Files"
          value={`${percentFlightsWithFiles.toFixed(2)}%`}
          grade={gradeFilesPercent}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <PageCard style={{ padding: 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Flights by Agent
          </h2>
          <BarList rows={agentRows} />
        </PageCard>

        <PageCard style={{ padding: 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Flights by Airline
          </h2>
          <BarList rows={airlineRows} />
        </PageCard>
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
            BSO Operations Detail
          </h2>
        </div>

        <div
          style={{
            width: "100%",
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
              minWidth: 1200,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                {[
                  "Date",
                  "Station",
                  "Airline",
                  "Flight",
                  "Origin",
                  "Belt",
                  "Agent",
                  "Actual Arrival",
                  "First Bag",
                  "Last Bag",
                  "Scan Start",
                  "Scan End",
                  "First Bag Min",
                  "Last Bag Min",
                  "Scan Window",
                  "OHD Bags",
                  "Files",
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      padding: 14,
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      textAlign: "left",
                      borderBottom: "1px solid #e2e8f0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={17}
                    style={{ padding: 14, fontSize: 14, color: "#0f172a" }}
                  >
                    {loading ? "Loading..." : "No records found."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.date || "—"}</td>
                    <td style={cellStyle}>{item.station || "—"}</td>
                    <td style={cellStyle}>{item.airline || "—"}</td>
                    <td style={cellStyle}>{item.flightNumber || "—"}</td>
                    <td style={cellStyle}>{item.origin || "—"}</td>
                    <td style={cellStyle}>{item.beltNumber || "—"}</td>
                    <td style={cellStyle}>{item.agentName || "—"}</td>
                    <td style={cellStyle}>{item.actualArrivalTime || "—"}</td>
                    <td style={cellStyle}>{item.firstBagTime || "—"}</td>
                    <td style={cellStyle}>{item.lastBagTime || "—"}</td>
                    <td style={cellStyle}>{item.scanStartTime || "—"}</td>
                    <td style={cellStyle}>{item.scanEndTime || "—"}</td>
                    <td style={cellStyle}>{safeNumber(item.firstBagMinutes).toFixed(2)}</td>
                    <td style={cellStyle}>{safeNumber(item.lastBagMinutes).toFixed(2)}</td>
                    <td style={cellStyle}>{safeNumber(item.scanWindowMinutes).toFixed(2)}</td>
                    <td style={cellStyle}>{safeNumber(item.onHandBags)}</td>
                    <td style={cellStyle}>{safeNumber(item.filesCreated)}</td>
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

const cellStyle = {
  padding: 14,
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};
