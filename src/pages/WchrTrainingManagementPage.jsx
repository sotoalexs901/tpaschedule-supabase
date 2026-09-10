// src/pages/WchrTrainingManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query } from "firebase/firestore";
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


function buildCertificateHtml(record) {
  const employeeName = record.employeeName || "Employee";
  const scenario =
    record.scenario === "OB"
      ? "Outbound WCHR Service - Counter to Gate"
      : "Inbound WCHR Service - CBP to Destination to Storage";

  const score = Number(record.score || 0);
  const result = record.passed ? "PASSED" : "REVIEW REQUIRED";
  const completedDate = formatDate(
    record.completedAt,
    record.completedAtClient
  );

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>WCHR Training Certificate</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            background: #eef6ff;
          }
          .certificate {
            max-width: 1000px;
            min-height: 700px;
            margin: 0 auto;
            background: #ffffff;
            border: 12px solid #0f5c91;
            padding: 18px;
            box-shadow: 0 18px 50px rgba(15,23,42,0.14);
          }
          .inner {
            min-height: 640px;
            border: 2px solid #6ec6e8;
            padding: 44px 54px;
            text-align: center;
            position: relative;
          }
          .brand {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: .18em;
            text-transform: uppercase;
            color: #1769aa;
          }
          .title {
            margin: 30px 0 10px;
            font-size: 44px;
            font-weight: 900;
            color: #0f172a;
          }
          .subtitle {
            font-size: 18px;
            color: #64748b;
            margin-bottom: 34px;
          }
          .name {
            font-size: 36px;
            font-weight: 900;
            color: #0f5c91;
            border-bottom: 2px solid #dbeafe;
            display: inline-block;
            padding: 0 22px 8px;
            margin-bottom: 24px;
          }
          .text {
            font-size: 18px;
            line-height: 1.7;
            color: #334155;
            max-width: 760px;
            margin: 0 auto;
          }
          .scenario {
            margin-top: 18px;
            font-size: 21px;
            font-weight: 800;
            color: #1769aa;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            margin-top: 34px;
          }
          .card {
            border: 1px solid #dbeafe;
            background: #f8fbff;
            border-radius: 14px;
            padding: 16px;
          }
          .label {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: .08em;
          }
          .value {
            margin-top: 6px;
            font-size: 18px;
            font-weight: 900;
          }
          .footer {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            gap: 20px;
            font-size: 13px;
            color: #64748b;
          }
          .signature {
            flex: 1;
            padding-top: 12px;
            border-top: 1px solid #94a3b8;
          }
          @media print {
            body {
              background: #ffffff;
              padding: 0;
            }
            .certificate {
              box-shadow: none;
              border-width: 10px;
              max-width: none;
            }
            @page {
              size: landscape;
              margin: 0.35in;
            }
          }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="inner">
            <div class="brand">AeroStation Hub · TPA WCHR Operations</div>
            <div class="title">Certificate of Completion</div>
            <div class="subtitle">WCHR Interactive Training Program</div>

            <div class="text">This certificate is presented to</div>
            <div class="name">${employeeName}</div>

            <div class="text">
              for completing the guided WCHR operational training scenario:
            </div>

            <div class="scenario">${scenario}</div>

            <div class="grid">
              <div class="card">
                <div class="label">Score</div>
                <div class="value">${score}%</div>
              </div>

              <div class="card">
                <div class="label">Result</div>
                <div class="value">${result}</div>
              </div>

              <div class="card">
                <div class="label">Completed</div>
                <div class="value">${completedDate}</div>
              </div>
            </div>

            <div class="footer">
              <div class="signature">WCHR Training Program</div>
              <div class="signature">TPA Eulen Operations</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default function WchrTrainingManagementPage() {
  const { user } = useUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const handlePrintCertificate = (record) => {
    const html = buildCertificateHtml(record);

    const printWindow = window.open(
      "",
      "_blank",
      "width=1200,height=900"
    );

    if (!printWindow) {
      window.alert(
        "Pop-up blocked. Please allow pop-ups to open and print the certificate."
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 350);
  };

  const handleDeleteTrainingRecord = async (record) => {
    const employeeName = record.employeeName || "this employee";
    const scenarioLabel =
      record.scenario === "OB" ? "Outbound" : "Inbound";

    const ok = window.confirm(
      `Delete the ${scenarioLabel} training completion record for ${employeeName}? This action cannot be undone.`
    );

    if (!ok) return;

    try {
      setDeletingId(record.id);

      await deleteDoc(
        doc(db, "wchr_training_completions", record.id)
      );

      setRows((prev) =>
        prev.filter((item) => item.id !== record.id)
      );
    } catch (err) {
      console.error("Error deleting training completion:", err);
      window.alert(
        "Could not delete the training completion record."
      );
    } finally {
      setDeletingId("");
    }
  };

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
                    "Actions",
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
                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handlePrintCertificate(row)}
                          style={{
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1769aa",
                            borderRadius: 10,
                            padding: "8px 10px",
                            fontSize: 11,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          Certificate / Print
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTrainingRecord(row)}
                          disabled={deletingId === row.id}
                          style={{
                            border: "1px solid #fecdd3",
                            background:
                              deletingId === row.id
                                ? "#ffe4e6"
                                : "#fff1f2",
                            color: "#be123c",
                            borderRadius: 10,
                            padding: "8px 10px",
                            fontSize: 11,
                            fontWeight: 900,
                            cursor:
                              deletingId === row.id
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              deletingId === row.id ? 0.7 : 1,
                          }}
                        >
                          {deletingId === row.id
                            ? "Deleting..."
                            : "Delete Record"}
                        </button>
                      </div>
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
