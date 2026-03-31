import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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

function formatDateTime(value) {
  const d = tsToDate(value);
  if (!d) return "—";
  return d.toLocaleString();
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfToday() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
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
  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
}

function getRangeDates(range) {
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  return { start: startOfMonth(), end: endOfMonth() };
}

function prettifyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  return raw === "yes" || raw === "true" || raw === "1";
}

function shouldFlagNeedsAttention(report) {
  if (report?.needsAttention) return true;

  const responses = report?.responses || {};
  return Object.entries(responses).some(([key, value]) => {
    const k = String(key || "").toLowerCase();
    if (
      k.includes("operation completed without issues") ||
      k.includes("operation completed without issue") ||
      k.includes("completed without issues")
    ) {
      return !parseBooleanLike(value) && String(value).trim().toLowerCase() !== "yes";
    }
    return false;
  });
}

function getDelayedMinutes(report) {
  return Number(report?.delayedTimeMinutes || 0);
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

function TextArea(props) {
  return (
    <textarea
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
        resize: "vertical",
        minHeight: 90,
        fontFamily: "inherit",
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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

export default function OperationalReportAdminPage() {
  const { user } = useUser();

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [filters, setFilters] = useState({
    airline: "all",
    range: "today",
  });

  const [editForm, setEditForm] = useState({
    airline: "",
    reportDate: "",
    shift: "",
    flightsHandled: "",
    supervisorReporting: "",
    notes: "",
    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",
    needsAttention: false,
    responses: {},
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const q = query(
          collection(db, "operational_reports"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          normalizedAirline: normalizeAirlineName(d.data().airline),
        }));

        setReports(rows);
      } catch (err) {
        console.error("Error loading operational reports:", err);
        setStatusMessage("Could not load operational reports.");
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

  const airlineOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      if (r.normalizedAirline) set.add(r.normalizedAirline);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const { start, end } = getRangeDates(filters.range);

    return reports.filter((r) => {
      const created = tsToDate(r.createdAt);
      if (!created) return false;
      if (created < start || created > end) return false;

      if (filters.airline !== "all" && r.normalizedAirline !== filters.airline) {
        return false;
      }

      return true;
    });
  }, [reports, filters]);

  const delayedReports = useMemo(() => {
    return filteredReports.filter((r) => Boolean(r.delayedFlight));
  }, [filteredReports]);

  const delayedSummaryByAirline = useMemo(() => {
    const map = {};

    delayedReports.forEach((r) => {
      const airline = r.normalizedAirline || "Unknown";
      if (!map[airline]) {
        map[airline] = {
          airline,
          totalDelayed: 0,
          maxMinutes: 0,
          reports: [],
        };
      }

      const minutes = getDelayedMinutes(r);

      map[airline].totalDelayed += 1;
      map[airline].maxMinutes = Math.max(map[airline].maxMinutes, minutes);
      map[airline].reports.push(r);
    });

    return Object.values(map).sort(
      (a, b) => b.totalDelayed - a.totalDelayed || a.airline.localeCompare(b.airline)
    );
  }, [delayedReports]);

  const alerts = useMemo(() => {
    const rows = [];

    delayedSummaryByAirline.forEach((item) => {
      if (filters.range === "month" && item.totalDelayed > 2) {
        rows.push({
          type: "followup",
          airline: item.airline,
          text: `${item.airline}: Duty Mgrs Follow up needed. More than 2 delayed flights reported this month.`,
        });
      }

      if (item.maxMinutes > 4) {
        rows.push({
          type: "followup",
          airline: item.airline,
          text: `${item.airline}: Duty Mgrs Follow up needed. At least one delayed flight exceeded 4 minutes.`,
        });
      }
    });

    filteredReports.forEach((r) => {
      if (shouldFlagNeedsAttention(r)) {
        rows.push({
          type: "attention",
          airline: r.normalizedAirline || "Unknown",
          text: `${r.normalizedAirline || "Unknown"}: Report needs attention because operation was not completed without issues.`,
        });
      }
    });

    return rows;
  }, [delayedSummaryByAirline, filteredReports, filters.range]);

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

  const startEdit = (report) => {
    setEditingId(report.id);
    setEditForm({
      airline: report.airline || "",
      reportDate: report.reportDate || "",
      shift: report.shift || "",
      flightsHandled: report.flightsHandled || "",
      supervisorReporting: report.supervisorReporting || "",
      notes: report.notes || "",
      delayedFlight: Boolean(report.delayedFlight),
      delayedTimeMinutes: report.delayedTimeMinutes ?? "",
      delayedReason: report.delayedReason || "",
      delayedCodeReported: report.delayedCodeReported || "",
      needsAttention: Boolean(report.needsAttention),
      responses: { ...(report.responses || {}) },
    });
    setSelectedId(report.id);
  };

  const cancelEdit = () => {
    setEditingId("");
    setSavingId("");
  };

  const handleDynamicResponseChange = (key, value) => {
    setEditForm((prev) => ({
      ...prev,
      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  const saveEdit = async (report) => {
    try {
      setSavingId(report.id);

      const payload = {
        airline: normalizeAirlineName(editForm.airline),
        reportDate: editForm.reportDate,
        shift: editForm.shift,
        flightsHandled: editForm.flightsHandled,
        supervisorReporting: editForm.supervisorReporting,
        notes: editForm.notes,
        delayedFlight: Boolean(editForm.delayedFlight),
        delayedTimeMinutes: Number(editForm.delayedTimeMinutes || 0),
        delayedReason: String(editForm.delayedReason || "").trim(),
        delayedCodeReported: String(editForm.delayedCodeReported || "").trim(),
        needsAttention: Boolean(editForm.needsAttention),
        responses: editForm.responses || {},
      };

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                normalizedAirline: normalizeAirlineName(payload.airline),
              }
            : item
        )
      );

      setEditingId("");
      setSavingId("");
      setStatusMessage("Operational report updated successfully.");
    } catch (err) {
      console.error("Error updating operational report:", err);
      setStatusMessage("Could not update operational report.");
      setSavingId("");
    }
  };

  const deleteReport = async (report) => {
    const ok = window.confirm(
      `Delete operational report for ${report.normalizedAirline || "Unknown"}?`
    );
    if (!ok) return;

    try {
      setDeletingId(report.id);
      await deleteDoc(doc(db, "operational_reports", report.id));
      setReports((prev) => prev.filter((item) => item.id !== report.id));
      setStatusMessage("Operational report deleted.");
    } catch (err) {
      console.error("Error deleting operational report:", err);
      setStatusMessage("Could not delete operational report.");
    } finally {
      setDeletingId("");
    }
  };

  if (!canAccess) {
    return (
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
          <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
            TPA OPS · Operational Reports
          </p>
          <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Access denied
          </h1>
          <p style={{ margin: 0, maxWidth: 700, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            Only Duty Managers and Station Managers can view operational reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
        <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
          TPA OPS · Operational Reports
        </p>
        <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
          Operational Report Admin
        </h1>
        <p style={{ margin: 0, maxWidth: 760, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
          Review delays, alerts, follow-up cases, and manage submitted operational reports.
        </p>
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
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
            <FieldLabel>Range</FieldLabel>
            <SelectInput
              value={filters.range}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, range: e.target.value }))
              }
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
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
              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {alerts.length > 0 && (
        <PageCard style={{ padding: 18 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#9f1239",
                marginBottom: 8,
              }}
            >
              Alerts
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.airline}-${index}`}
                  style={{
                    color: "#9f1239",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
            Delay Summary by Airline
          </h2>
        </div>

        {delayedSummaryByAirline.length === 0 ? (
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
            No delayed flights found for this filter.
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
                minWidth: 700,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Airline</th>
                  <th style={thStyle()}>Delayed Flights</th>
                  <th style={thStyle()}>Max Delay</th>
                  <th style={thStyle()}>Follow Up</th>
                </tr>
              </thead>
              <tbody>
                {delayedSummaryByAirline.map((row, index) => {
                  const needFollowUp =
                    (filters.range === "month" && row.totalDelayed > 2) ||
                    row.maxMinutes > 4;

                  return (
                    <tr
                      key={row.airline}
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>{row.airline}</td>
                      <td style={tdStyle}>{row.totalDelayed}</td>
                      <td style={tdStyle}>{row.maxMinutes} min</td>
                      <td style={tdStyle}>
                        {needFollowUp ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              background: "#fff1f2",
                              color: "#9f1239",
                              border: "1px solid #fecdd3",
                            }}
                          >
                            Duty Mgrs Follow up needed
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              background: "#dcfce7",
                              color: "#166534",
                              border: "1px solid #86efac",
                            }}
                          >
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.95fr) minmax(420px, 1.25fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
              Submitted Reports
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
            <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
              Loading operational reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
              No operational reports found.
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
                  minWidth: 980,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>Date</th>
                    <th style={thStyle()}>Supervisor</th>
                    <th style={thStyle()}>Delayed</th>
                    <th style={thStyle()}>Minutes</th>
                    <th style={thStyle()}>Needs Attention</th>
                    <th style={thStyle()}>Created</th>
                    <th style={thStyle({ textAlign: "center" })}>Actions</th>
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
                      <td style={tdStyle}>{report.normalizedAirline || "—"}</td>
                      <td style={tdStyle}>{report.reportDate || "—"}</td>
                      <td style={tdStyle}>{report.supervisorReporting || "—"}</td>
                      <td style={tdStyle}>{report.delayedFlight ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{Number(report.delayedTimeMinutes || 0)}</td>
                      <td style={tdStyle}>{shouldFlagNeedsAttention(report) ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{formatDateTime(report.createdAt)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton variant="secondary" onClick={() => setSelectedId(report.id)}>
                            View
                          </ActionButton>

                          <ActionButton variant="warning" onClick={() => startEdit(report)}>
                            Edit
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => deleteReport(report)}
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
            {editingId === selectedReport.id ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                    Edit Operational Report
                  </h2>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton
                      variant="success"
                      onClick={() => saveEdit(selectedReport)}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Save"}
                    </ActionButton>

                    <ActionButton variant="secondary" onClick={cancelEdit}>
                      Cancel
                    </ActionButton>
                  </div>
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
                    <TextInput
                      value={editForm.airline}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, airline: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Report Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={editForm.reportDate}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, reportDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Shift</FieldLabel>
                    <TextInput
                      value={editForm.shift}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, shift: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Flights Handled</FieldLabel>
                    <TextInput
                      value={editForm.flightsHandled}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, flightsHandled: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Supervisor Reporting</FieldLabel>
                    <TextInput
                      value={editForm.supervisorReporting}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, supervisorReporting: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Flight</FieldLabel>
                    <SelectInput
                      value={editForm.delayedFlight ? "Yes" : "No"}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedFlight: e.target.value === "Yes",
                        }))
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Delayed Time (minutes)</FieldLabel>
                    <TextInput
                      type="number"
                      value={editForm.delayedTimeMinutes}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedTimeMinutes: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Code Reported</FieldLabel>
                    <TextInput
                      value={editForm.delayedCodeReported}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedCodeReported: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Delayed Reason</FieldLabel>
                  <TextArea
                    value={editForm.delayedReason}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        delayedReason: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextArea
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                  />
                </div>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.needsAttention}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        needsAttention: e.target.checked,
                      }))
                    }
                  />
                  Needs Attention
                </label>

                <div>
                  <FieldLabel>Dynamic Responses</FieldLabel>
                  <div style={{ display: "grid", gap: 12 }}>
                    {Object.entries(editForm.responses || {}).map(([key, value]) => (
                      <div key={key}>
                        <FieldLabel>{prettifyKey(key)}</FieldLabel>
                        <TextArea
                          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                          onChange={(e) =>
                            handleDynamicResponseChange(key, e.target.value)
                          }
                          style={{ minHeight: 70 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                    Report Detail
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                    {selectedReport.normalizedAirline || "—"} · {selectedReport.reportDate || "—"}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <InfoCard label="Airline" value={selectedReport.normalizedAirline || "—"} />
                  <InfoCard label="Report Date" value={selectedReport.reportDate || "—"} />
                  <InfoCard label="Shift" value={selectedReport.shift || "—"} />
                  <InfoCard label="Flights Handled" value={selectedReport.flightsHandled || "—"} />
                  <InfoCard label="Supervisor" value={selectedReport.supervisorReporting || "—"} />
                  <InfoCard label="Delayed Flight" value={selectedReport.delayedFlight ? "Yes" : "No"} />
                  <InfoCard label="Delayed Time" value={`${Number(selectedReport.delayedTimeMinutes || 0)} min`} />
                  <InfoCard label="Delayed Code" value={selectedReport.delayedCodeReported || "—"} />
                </div>

                <DetailBox label="Delayed Reason" value={selectedReport.delayedReason || "—"} />
                <DetailBox label="Notes" value={selectedReport.notes || "—"} />

                {shouldFlagNeedsAttention(selectedReport) && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      color: "#9f1239",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    This report needs attention because the operation was not completed without issues.
                  </div>
                )}

                {selectedReport.delayedFlight && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      color: "#9a3412",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Delay Alert: {selectedReport.normalizedAirline || "Unknown"} reported a delay of{" "}
                    {Number(selectedReport.delayedTimeMinutes || 0)} minutes.
                    {Number(selectedReport.delayedTimeMinutes || 0) > 4
                      ? " Duty Mgrs Follow up needed."
                      : ""}
                  </div>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Dynamic Responses
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {Object.entries(selectedReport.responses || {}).length === 0 ? (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No dynamic responses found.
                      </div>
                    ) : (
                      Object.entries(selectedReport.responses || {}).map(([key, value]) => (
                        <div
                          key={key}
                          style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#64748b",
                              marginBottom: 4,
                            }}
                          >
                            {prettifyKey(key)}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#0f172a",
                              fontWeight: 600,
                              whiteSpace: "pre-line",
                            }}
                          >
                            {Array.isArray(value) ? value.join(", ") : String(value || "—")}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
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

function DetailBox({ label, value }) {
  return (
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
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#0f172a",
          whiteSpace: "pre-line",
          lineHeight: 1.7,
        }}
      >
        {value}
      </div>
    </div>
  );
}
