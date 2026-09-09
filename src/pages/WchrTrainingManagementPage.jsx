// src/pages/WchrTrainingManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.07)",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function formatDate(value, fallback = "") {
  try {
    if (value?.toDate) return value.toDate().toLocaleString();
    if (fallback) return new Date(fallback).toLocaleString();
    if (value) return new Date(value).toLocaleString();
  } catch {}
  return "—";
}

export default function WchrTrainingManagementPage() {
  const { user } = useUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const canManage =
    user?.role === "station_manager" || user?.role === "duty_manager";

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError("");

        const snap = await getDocs(
          query(
            collection(db, "wchr_training_completions"),
            orderBy("completedAt", "desc")
          )
        );

        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      } catch (err) {
        console.error("Error loading WCHR training completions:", err);
        setError("Could not load WCHR training completion history.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [canManage]);

  const filtered = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (scenarioFilter !== "ALL" && row.scenario !== scenarioFilter) {
        return false;
      }

      if (!searchValue) return true;

      const haystack = [
        row.employeeName,
        row.username,
        row.employeeId,
        row.department,
        row.scenarioLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchValue);
    });
  }, [rows, scenarioFilter, search]);

  const uniqueEmployees = useMemo(() => {
    return new Set(
      filtered.map((row) => row.employeeId || row.userId || row.employeeName)
    ).size;
  }, [filtered]);

  const averageScore = useMemo(() => {
    if (!filtered.length) return 0;
    return (
      filtered.reduce((sum, row) => sum + Number(row.score || 0), 0) /
      filtered.length
    );
  }, [filtered]);

  const passedCount = filtered.filter((row) => row.passed).length;
  const reviewCount = filtered.filter((row) => !row.passed).length;

  if (!canManage) {
    return (
      <PageCard style={{ padding: 22 }}>
        <div style={{ fontWeight: 900, color: "#9f1239" }}>
          Access denied. WCHR training management is available to Duty Managers
          and Station Managers.
        </div>
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        minWidth: 0,
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
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "rgba(255,255,255,0.78)",
          }}
        >
          WCHR Training · Management
        </div>
        <h1
          style={{
            margin: "9px 0 5px",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          Training Completion Report
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
          Review employee completion, score, scenario, date and training result.
        </p>
      </div>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {[
            ["Completions", filtered.length],
            ["Employees", uniqueEmployees],
            ["Average Score", `${averageScore.toFixed(1)}%`],
            ["Passed", passedCount],
            ["Needs Review", reviewCount],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: 14,
                borderRadius: 15,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 22,
                  fontWeight: 950,
                  color: "#0f172a",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px,1fr) minmax(180px,260px)",
            gap: 10,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, username or department..."
            style={{
              width: "100%",
              border: "1px solid #dbeafe",
              borderRadius: 13,
              padding: "11px 13px",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />

          <select
            value={scenarioFilter}
            onChange={(e) => setScenarioFilter(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #dbeafe",
              borderRadius: 13,
              padding: "11px 13px",
              background: "#fff",
              fontFamily: "inherit",
            }}
          >
            <option value="ALL">All Scenarios</option>
            <option value="OB">Outbound</option>
            <option value="IB">Inbound</option>
          </select>
        </div>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
        {loading ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>
            Loading training history...
          </div>
        ) : error ? (
          <div style={{ color: "#9f1239", fontWeight: 800 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>
            No training completions found.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 1050,
                borderCollapse: "separate",
                borderSpacing: 0,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  {[
                    "Employee",
                    "Scenario",
                    "Score",
                    "Result",
                    "Correct",
                    "Incorrect",
                    "Language",
                    "Completed",
                  ].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: 13,
                        textAlign: "left",
                        fontSize: 11,
                        color: "#475569",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
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
                {filtered.map((row, index) => (
                  <tr
                    key={row.id}
                    style={{
                      background: index % 2 === 0 ? "#fff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 900 }}>{row.employeeName || "—"}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: "#64748b" }}>
                        {row.username || row.employeeId || "—"}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {row.scenario === "OB" ? "Outbound" : "Inbound"}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 950 }}>
                      {Number(row.score || 0)}%
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 9px",
                          borderRadius: 999,
                          background: row.passed ? "#ecfdf5" : "#fff1f2",
                          border: row.passed
                            ? "1px solid #a7f3d0"
                            : "1px solid #fecdd3",
                          color: row.passed ? "#047857" : "#be123c",
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        {row.passed ? "PASSED" : "REVIEW"}
                      </span>
                    </td>
                    <td style={tdStyle}>{Number(row.correctAnswers || 0)}</td>
                    <td style={tdStyle}>{Number(row.incorrectAnswers || 0)}</td>
                    <td style={tdStyle}>
                      {row.language === "es" ? "Español" : "English"}
                    </td>
                    <td style={tdStyle}>
                      {formatDate(row.completedAt, row.completedAtClient)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  );
}

const tdStyle = {
  padding: 13,
  borderBottom: "1px solid #eef2f7",
  color: "#0f172a",
  fontSize: 13,
  verticalAlign: "middle",
};
