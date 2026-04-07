import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 100,
        fontFamily: "inherit",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
  disabled = false,
  type = "button",
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
    },
    dark: {
      background: "#0f172a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(15,23,42,0.18)",
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
          fontSize: 18,
          fontWeight: 900,
          color: current.color,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function formatMonthValue(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return value || "-";
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getCurrentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions() {
  const now = new Date();
  const result = [];

  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({
      value,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
    });
  }

  return result;
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

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function getPerformanceTone(score) {
  const n = Number(score || 0);
  if (n >= 85) return "green";
  if (n >= 70) return "blue";
  return "red";
}

function getStatusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "recognized" || s === "closed") return "green";
  if (s === "follow_up") return "amber";
  return "blue";
}

export default function EmployeePerformanceManagementPage() {
  const { user } = useUser();

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [managerNote, setManagerNote] = useState("");

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [filters, setFilters] = useState({
    month: getCurrentMonthValue(),
    employee: "all",
    supervisor: "all",
    managerStatus: "all",
    followUp: "all",
    scoreBand: "all",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const snap = await getDocs(
          query(
            collection(db, "employeePerformanceReports"),
            orderBy("createdAt", "desc")
          )
        );

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (err) {
        console.error("Error loading EPR management:", err);
        setStatusMessage("Could not load performance reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const employeeOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => r.employeeName && set.add(r.employeeName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const supervisorOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => r.supervisorName && set.add(r.supervisorName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filters.month !== "all" && report.month !== filters.month) return false;
      if (filters.employee !== "all" && report.employeeName !== filters.employee)
        return false;
      if (
        filters.supervisor !== "all" &&
        report.supervisorName !== filters.supervisor
      )
        return false;
      if (
        filters.managerStatus !== "all" &&
        String(report.managerStatus || "submitted").toLowerCase() !==
          filters.managerStatus
      )
        return false;

      if (filters.followUp === "yes" && report.needsFollowUp !== true) return false;
      if (filters.followUp === "no" && report.needsFollowUp === true) return false;

      const score = Number(report.score || 0);
      if (filters.scoreBand === "low" && score >= 70) return false;
      if (filters.scoreBand === "mid" && (score < 70 || score >= 85)) return false;
      if (filters.scoreBand === "high" && score < 85) return false;

      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedReportId) || null;
  }, [filteredReports, selectedReportId]);

  useEffect(() => {
    if (selectedReport) {
      setManagerNote(selectedReport.managerNote || "");
    } else {
      setManagerNote("");
    }
  }, [selectedReport]);

  const totals = useMemo(() => {
    const total = filteredReports.length;
    const followUps = filteredReports.filter((r) => r.needsFollowUp === true).length;
    const approved = filteredReports.filter(
      (r) => String(r.managerStatus || "").toLowerCase() === "approved"
    ).length;
    const avgScore =
      total > 0
        ? filteredReports.reduce((sum, r) => sum + Number(r.score || 0), 0) / total
        : 0;

    return {
      total,
      followUps,
      approved,
      avgScore,
    };
  }, [filteredReports]);

  async function updateManagerStatus(reportId, nextStatus) {
    try {
      setSavingId(reportId);

      await updateDoc(doc(db, "employeePerformanceReports", reportId), {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        managerNote: managerNote || "",
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                managerStatus: nextStatus,
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                managerNote: managerNote || "",
              }
            : item
        )
      );

      setStatusMessage(`Report updated to ${nextStatus}.`);
    } catch (err) {
      console.error("Error updating EPR manager status:", err);
      setStatusMessage("Could not update report.");
    } finally {
      setSavingId("");
    }
  }

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 22 }}>
        Only Duty Managers and Station Managers can access this page.
      </PageCard>
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
          TPA OPS · Management of Reports
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
          Employee Performance Management
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 960,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Review EPR reports sent by supervisors, filter by month/employee/follow
          up/score, and manage approvals, recognition, or follow-up actions.
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Month</FieldLabel>
            <SelectInput
              value={filters.month}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, month: e.target.value }))
              }
            >
              <option value="all">All</option>
              {monthOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Employee</FieldLabel>
            <SelectInput
              value={filters.employee}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, employee: e.target.value }))
              }
            >
              <option value="all">All</option>
              {employeeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Supervisor</FieldLabel>
            <SelectInput
              value={filters.supervisor}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, supervisor: e.target.value }))
              }
            >
              <option value="all">All</option>
              {supervisorOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={filters.managerStatus}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, managerStatus: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="follow_up">Follow Up</option>
              <option value="closed">Closed</option>
              <option value="recognized">Recognized</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Follow Up</FieldLabel>
            <SelectInput
              value={filters.followUp}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, followUp: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="yes">Needs Follow Up</option>
              <option value="no">No Follow Up</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Score Band</FieldLabel>
            <SelectInput
              value={filters.scoreBand}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, scoreBand: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="low">Low (&lt; 70)</option>
              <option value="mid">Meets (70 - 84.99)</option>
              <option value="high">High (85+)</option>
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
        <InfoCard label="Reports" value={String(totals.total)} />
        <InfoCard label="Follow Up" value={String(totals.followUps)} tone="amber" />
        <InfoCard label="Approved" value={String(totals.approved)} tone="green" />
        <InfoCard
          label="Average Score"
          value={formatScore(totals.avgScore)}
          tone={getPerformanceTone(totals.avgScore)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            selectedReport ? "minmax(360px, 0.95fr) minmax(420px, 1.05fr)" : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Received Reports
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Filtered reports sent by supervisors.
            </p>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : filteredReports.length === 0 ? (
            <div>No reports found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  style={{
                    cursor: "pointer",
                    border:
                      selectedReportId === report.id
                        ? "1px solid #bfe0fb"
                        : "1px solid #e2e8f0",
                    background:
                      selectedReportId === report.id ? "#edf7ff" : "#ffffff",
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.employeeName || "-"}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {report.templateLabel || "-"} ·{" "}
                        {formatMonthValue(report.month)} · Supervisor:{" "}
                        {report.supervisorName || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 6,
                        justifyItems: "end",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#1769aa",
                        }}
                      >
                        Score {formatScore(report.score)}
                      </span>

                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          background:
                            report.needsFollowUp === true ? "#fff7ed" : "#ecfdf5",
                          border:
                            report.needsFollowUp === true
                              ? "1px solid #fdba74"
                              : "1px solid #a7f3d0",
                          color:
                            report.needsFollowUp === true ? "#9a3412" : "#166534",
                        }}
                      >
                        {report.needsFollowUp ? "Follow Up" : "Good Standing"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {selectedReport.employeeName || "-"}
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  {selectedReport.templateLabel || "-"} ·{" "}
                  {formatMonthValue(selectedReport.month)} · Sent by{" "}
                  {selectedReport.supervisorName || "-"}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <InfoCard
                  label="Score"
                  value={`${formatScore(selectedReport.score)} / 100`}
                  tone={getPerformanceTone(selectedReport.score)}
                />
                <InfoCard
                  label="Status"
                  value={selectedReport.managerStatus || "submitted"}
                  tone={getStatusTone(selectedReport.managerStatus)}
                />
                <InfoCard
                  label="Follow Up"
                  value={selectedReport.needsFollowUp ? "Yes" : "No"}
                  tone={selectedReport.needsFollowUp ? "amber" : "green"}
                />
                <InfoCard
                  label="Sent"
                  value={formatDateTime(selectedReport.createdAt)}
                  tone="default"
                />
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 16,
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 10,
                  }}
                >
                  Follow Up Questions
                </div>

                {Array.isArray(selectedReport.followUpItems) &&
                selectedReport.followUpItems.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedReport.followUpItems.map((item) => (
                      <div key={item.id} style={{ fontSize: 14, color: "#7c2d12" }}>
                        • {item.en || item.es}
                        {item.note ? ` — ${item.note}` : ""}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: "#64748b" }}>
                    No follow-up questions on this report.
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 16,
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 10,
                  }}
                >
                  Comments
                </div>

                <div style={{ display: "grid", gap: 10, color: "#334155", fontSize: 14 }}>
                  <div>
                    <strong>Company:</strong> {selectedReport.commentsCompany || "-"}
                  </div>
                  <div>
                    <strong>Employee:</strong> {selectedReport.commentsEmployee || "-"}
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel>Manager Note</FieldLabel>
                <TextArea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  placeholder="Add recognition, follow-up instruction, coaching note, etc."
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <ActionButton
                  variant="success"
                  onClick={() => updateManagerStatus(selectedReport.id, "approved")}
                  disabled={savingId === selectedReport.id}
                >
                  {savingId === selectedReport.id ? "Saving..." : "Approve"}
                </ActionButton>

                <ActionButton
                  variant="warning"
                  onClick={() => updateManagerStatus(selectedReport.id, "follow_up")}
                  disabled={savingId === selectedReport.id}
                >
                  {savingId === selectedReport.id ? "Saving..." : "Mark Follow Up"}
                </ActionButton>

                <ActionButton
                  variant="dark"
                  onClick={() => updateManagerStatus(selectedReport.id, "recognized")}
                  disabled={savingId === selectedReport.id}
                >
                  {savingId === selectedReport.id ? "Saving..." : "Recognize / Congratulate"}
                </ActionButton>

                <ActionButton
                  variant="secondary"
                  onClick={() => updateManagerStatus(selectedReport.id, "closed")}
                  disabled={savingId === selectedReport.id}
                >
                  {savingId === selectedReport.id ? "Saving..." : "Close Case"}
                </ActionButton>
              </div>
            </div>
          </PageCard>
        )}
      </div>
    </div>
  );
}
