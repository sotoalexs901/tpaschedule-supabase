import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function normalizeAirlineName(value) {
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
}

function tsToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = tsToDate(value);
  if (!d) return "—";
  return d.toLocaleDateString();
}

function formatDateTime(value) {
  const d = tsToDate(value);
  if (!d) return "—";
  return d.toLocaleString();
}

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

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 700,
        color: "#475569",
        letterSpacing: "0.03em",
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
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
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 14,
};

function statusBadge(status) {
  const value = String(status || "").toUpperCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (value === "SUBMITTED") {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

export default function TimesheetAdminPage() {
  const { user } = useUser();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [filters, setFilters] = useState({
    airline: "all",
    reportDate: "",
    submittedBy: "",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const q = query(
          collection(db, "timesheet_reports"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (err) {
        console.error("Error loading timesheet reports:", err);
        setStatusMessage("Could not load timesheet reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadReports();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const airline = normalizeAirlineName(r.airline);
      const submittedBy = String(
        r.submittedByName || r.submittedByUsername || ""
      ).toLowerCase();

      if (filters.airline !== "all" && airline !== filters.airline) return false;
      if (filters.reportDate && r.reportDate !== filters.reportDate) return false;
      if (
        filters.submittedBy &&
        !submittedBy.includes(filters.submittedBy.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [reports, filters]);

  const airlineOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      if (r.airline) set.add(normalizeAirlineName(r.airline));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedId) || null;
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (selectedId && !filteredReports.some((r) => r.id === selectedId)) {
      setSelectedId(filteredReports[0]?.id || "");
    }
  }, [filteredReports, selectedId]);

  const handleDelete = async (report) => {
    const ok = window.confirm(
      `Delete this timesheet report from ${report.reportDate || "unknown date"}?`
    );
    if (!ok) return;

    try {
      setDeletingId(report.id);
      await deleteDoc(doc(db, "timesheet_reports", report.id));
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setStatusMessage("Timesheet report deleted.");
    } catch (err) {
      console.error("Error deleting timesheet:", err);
      setStatusMessage("Could not delete timesheet report.");
    } finally {
      setDeletingId("");
    }
  };

  if (!canAccess) {
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
          }}
        >
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
            TPA OPS · Timesheets
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
            Access denied
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            You do not have permission to view timesheet reports.
          </p>
        </div>
      </div>
    );
  }

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

        <div style={{ position: "relative" }}>
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
            TPA OPS · Timesheets
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
            Timesheet Reports
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Review submitted timesheets, open the detail, print, save PDF or
            remove reports sent by mistake.
          </p>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Filters
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All</option>
              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Report Date</FieldLabel>
            <TextInput
              type="date"
              value={filters.reportDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, reportDate: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>Submitted By</FieldLabel>
            <TextInput
              value={filters.submittedBy}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, submittedBy: e.target.value }))
              }
              placeholder="Search by supervisor"
            />
          </div>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.9fr) minmax(420px, 1.3fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
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
              Submitted Reports
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Loading timesheet reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              No timesheet reports found.
            </div>
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
                  minWidth: 900,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle}>Airline</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Submitted By</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report, index) => (
                    <tr
                      key={report.id}
                      style={{
                        background:
                          report.id === selectedId
                            ? "#edf7ff"
                            : index % 2 === 0
                            ? "#ffffff"
                            : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>{normalizeAirlineName(report.airline) || "—"}</td>
                      <td style={tdStyle}>{report.reportDate || "—"}</td>
                      <td style={tdStyle}>
                        {report.submittedByName ||
                          report.supervisorReporting ||
                          report.submittedByUsername ||
                          "—"}
                      </td>
                      <td style={tdStyle}>{formatDateTime(report.createdAt)}</td>
                      <td style={tdStyle}>
                        <span style={statusBadge(report.status)}>
                          {String(report.status || "submitted").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton
                            variant="secondary"
                            onClick={() => setSelectedId(report.id)}
                          >
                            View
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => handleDelete(report)}
                            disabled={deletingId === report.id}
                          >
                            {deletingId === report.id ? "Deleting..." : "Delete"}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            <div
              id="timesheet-print-area"
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#0f172a",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Timesheet Detail
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    {normalizeAirlineName(selectedReport.airline) || "—"} ·{" "}
                    {selectedReport.reportDate || "—"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    variant="secondary"
                    onClick={() => window.print()}
                  >
                    Print / Save PDF
                  </ActionButton>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <InfoCard
                  label="Airline"
                  value={normalizeAirlineName(selectedReport.airline) || "—"}
                />
                <InfoCard
                  label="Report Date"
                  value={selectedReport.reportDate || "—"}
                />
                <InfoCard
                  label="Shift"
                  value={selectedReport.shift || "—"}
                />
                <InfoCard
                  label="Supervisor Reporting"
                  value={selectedReport.supervisorReporting || "—"}
                />
                <InfoCard
                  label="Submitted By"
                  value={
                    selectedReport.submittedByName ||
                    selectedReport.submittedByUsername ||
                    "—"
                  }
                />
                <InfoCard
                  label="Created At"
                  value={formatDateTime(selectedReport.createdAt)}
                />
              </div>

              {selectedReport.notes && (
                <div
                  style={{
                    borderRadius: 16,
                    padding: "14px 16px",
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                    }}
                  >
                    Notes
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#0f172a",
                      whiteSpace: "pre-line",
                      lineHeight: 1.7,
                    }}
                  >
                    {selectedReport.notes}
                  </div>
                </div>
              )}

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
                    minWidth: 1100,
                    background: "#fff",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fbff" }}>
                      <th style={thStyle}>Employee</th>
                      <th style={thStyle}>Punch In</th>
                      <th style={thStyle}>Punch Out</th>
                      <th style={thStyle}>Employee Status</th>
                      <th style={thStyle}>Break Taken</th>
                      <th style={thStyle}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedReport.rows || []).map((row, index) => (
                      <tr
                        key={index}
                        style={{
                          background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                        }}
                      >
                        <td style={tdStyle}>{row.employeeName || "—"}</td>
                        <td style={tdStyle}>{row.punchIn || "—"}</td>
                        <td style={tdStyle}>{row.punchOut || "—"}</td>
                        <td style={tdStyle}>{row.employeeStatus || "—"}</td>
                        <td style={tdStyle}>{row.breakTaken || "—"}</td>
                        <td style={tdStyle}>{row.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </PageCard>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
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
          fontSize: 16,
          fontWeight: 800,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
