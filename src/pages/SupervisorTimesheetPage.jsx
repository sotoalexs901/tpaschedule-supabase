import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SY" },
  { value: "WestJet", label: "WestJet" },
  { value: "WL Invicta", label: "WL Invicta" },
  { value: "AV", label: "AV" },
  { value: "EA", label: "EA" },
  { value: "WCHR", label: "WCHR" },
  { value: "CABIN", label: "Cabin Service" },
  { value: "AA-BSO", label: "AA-BSO" },
  { value: "OTHER", label: "Other" },
];

const STATUS_OPTIONS = [
  "Present",
  "Late",
  "Call Out",
  "No Show",
  "Sent Home",
  "Training",
  "Modified Duty",
  "Other",
];

const BREAK_OPTIONS = [
  "No",
  "Yes",
  "30 min",
  "45 min",
  "60 min",
];

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

function detectBudgetAirline(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();

  if (!upper) return "";

  if (upper === "SY" || upper.startsWith("SY ") || upper.includes(" SY")) {
    return "SY";
  }

  if (
    upper.includes("WESTJET") ||
    upper.includes("WL HAVANA") ||
    upper === "WL"
  ) {
    return "WestJet";
  }

  if (upper.includes("WL INVICTA")) {
    return "WL Invicta";
  }

  if (upper === "AV" || upper.startsWith("AV ") || upper.includes("AVIANCA")) {
    return "AV";
  }

  if (upper === "EA" || upper.startsWith("EA ")) {
    return "EA";
  }

  if (upper.includes("WCHR")) {
    return "WCHR";
  }

  if (upper.includes("CABIN")) {
    return "CABIN";
  }

  if (upper.includes("AA-BSO") || upper.includes("AA BSO")) {
    return "AA-BSO";
  }

  if (upper.includes("OTHER")) {
    return "OTHER";
  }

  return normalizeAirlineName(raw);
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getBreakMinutes(value) {
  const v = String(value || "").trim().toLowerCase();

  if (!v || v === "no") return 0;
  if (v === "yes") return 30;
  if (v.includes("30")) return 30;
  if (v.includes("45")) return 45;
  if (v.includes("60")) return 60;

  return 0;
}

function calculateRowHours(row) {
  const start = toMinutes(row?.punchIn);
  const endRaw = toMinutes(row?.punchOut);

  if (start == null || endRaw == null) return 0;

  let end = endRaw;
  if (end <= start) end += 24 * 60;

  let minutes = end - start;
  minutes -= getBreakMinutes(row?.breakTaken);

  if (minutes < 0) minutes = 0;

  return minutes / 60;
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

function emptyRow() {
  return {
    employeeId: "",
    employeeName: "",
    punchIn: "",
    punchOut: "",
    employeeStatus: "",
    breakTaken: "No",
    reason: "",
  };
}

export default function SupervisorTimesheetPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [budgetDocs, setBudgetDocs] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    airline: "",
    reportDate: "",
    shift: "",
    supervisorReporting: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "",
    overBudgetReason: "",
  });

  const [rows, setRows] = useState([emptyRow()]);

  useEffect(() => {
    async function loadData() {
      try {
        const [usersSnap, budgetsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "airlineBudgets")),
        ]);

        const employeeList = usersSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((item) => item.role === "agent" || item.role === "supervisor")
          .map((item) => ({
            id: item.id,
            name:
              item.displayName ||
              item.fullName ||
              item.name ||
              item.username ||
              "Unnamed employee",
            role: item.position || getDefaultPosition(item.role),
            username: item.username || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const budgets = budgetsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setEmployees(employeeList);
        setBudgetDocs(budgets);
      } catch (err) {
        console.error("Error loading employees/budgets:", err);
        setStatusMessage("Could not load employees or budgets.");
      } finally {
        setLoadingEmployees(false);
      }
    }

    loadData();
  }, []);

  const employeeMap = useMemo(() => {
    const map = {};
    employees.forEach((emp) => {
      map[emp.id] = emp;
    });
    return map;
  }, [employees]);

  const budgetByAirline = useMemo(() => {
    const totals = {};

    budgetDocs.forEach((item) => {
      const source =
        item.airline ||
        item.airlineDisplayName ||
        item.name ||
        item.code ||
        item.id ||
        "";

      const airline = detectBudgetAirline(source);
      const weekly = Number(item.budgetHours || 0);
      const dailyManual =
        item.dailyBudgetHours === null ||
        item.dailyBudgetHours === undefined ||
        item.dailyBudgetHours === ""
          ? null
          : Number(item.dailyBudgetHours);

      if (!airline) return;

      if (!totals[airline]) {
        totals[airline] = {
          daily: 0,
          weekly: 0,
          hasManualDaily: false,
        };
      }

      totals[airline].weekly += Number.isNaN(weekly) ? 0 : weekly;

      if (dailyManual !== null && !Number.isNaN(dailyManual)) {
        totals[airline].daily += dailyManual;
        totals[airline].hasManualDaily = true;
      }
    });

    const finalMap = {};
    Object.keys(totals).forEach((airline) => {
      const item = totals[airline];
      finalMap[airline] = item.hasManualDaily ? item.daily : item.weekly / 7;
    });

    return finalMap;
  }, [budgetDocs]);

  const selectedAirline = normalizeAirlineName(form.airline);
  const currentBudget = Number(budgetByAirline[selectedAirline] || 0);

  const totalReportedHours = useMemo(() => {
    return rows.reduce((sum, row) => sum + calculateRowHours(row), 0);
  }, [rows]);

  const overBudget = currentBudget > 0 && totalReportedHours > currentBudget;
  const overBudgetBy = overBudget ? totalReportedHours - currentBudget : 0;

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRowChange = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (field === "employeeId") {
          const selected = employeeMap[value];
          return {
            ...row,
            employeeId: value,
            employeeName: selected?.name || "",
          };
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (index) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!form.airline) {
      setStatusMessage("Please select the reporting airline.");
      return;
    }

    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return;
    }

    const cleanRows = rows
      .map((row) => ({
        employeeId: row.employeeId,
        employeeName: String(row.employeeName || "").trim(),
        punchIn: String(row.punchIn || "").trim(),
        punchOut: String(row.punchOut || "").trim(),
        employeeStatus: String(row.employeeStatus || "").trim(),
        breakTaken: String(row.breakTaken || "").trim(),
        reason: String(row.reason || "").trim(),
        rowHours: calculateRowHours(row),
      }))
      .filter(
        (row) =>
          row.employeeId ||
          row.employeeName ||
          row.punchIn ||
          row.punchOut ||
          row.employeeStatus ||
          row.breakTaken ||
          row.reason
      );

    if (!cleanRows.length) {
      setStatusMessage("Please add at least one employee row.");
      return;
    }

    const missingEmployee = cleanRows.some((row) => !row.employeeId);
    if (missingEmployee) {
      setStatusMessage("Each row must have an employee selected.");
      return;
    }

    const missingStatus = cleanRows.some((row) => !row.employeeStatus);
    if (missingStatus) {
      setStatusMessage("Each row must have an employee status selected.");
      return;
    }

    if (overBudget && !String(form.overBudgetReason || "").trim()) {
      setStatusMessage("Please explain why this timesheet is over budget.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "timesheet_reports"), {
        airline: normalizeAirlineName(form.airline),
        reportDate: form.reportDate,
        shift: form.shift || "",
        supervisorReporting: form.supervisorReporting || getVisibleName(user),
        supervisorPosition:
          form.supervisorPosition || user?.position || getDefaultPosition(user?.role),
        notes: form.notes || "",
        rows: cleanRows,
        totalHours: totalReportedHours,
        budgetHoursDaily: currentBudget,
        overBudget,
        overBudgetBy: overBudget ? overBudgetBy : 0,
        overBudgetReason: overBudget ? form.overBudgetReason : "",
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
        status: "submitted",
      });

      setStatusMessage("Timesheet submitted successfully.");

      setForm((prev) => ({
        ...prev,
        airline: "",
        reportDate: "",
        shift: "",
        notes: "",
        overBudgetReason: "",
      }));

      setRows([emptyRow()]);
    } catch (err) {
      console.error("Error saving timesheet:", err);
      setStatusMessage("Could not submit timesheet.");
    } finally {
      setSaving(false);
    }
  };

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
              Submit Timesheet Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Create a timesheet report and send it to Station Manager, Duty
              Manager and admin review.
            </p>
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </ActionButton>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: overBudget ? "#fff1f2" : "#edf7ff",
              border: `1px solid ${overBudget ? "#fecdd3" : "#cfe7fb"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: overBudget ? "#9f1239" : "#1769aa",
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
            Report Header
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Complete the general information before filling employee rows.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Reporting Airline</FieldLabel>
            <SelectInput
              value={form.airline}
              onChange={(e) => handleFormChange("airline", e.target.value)}
            >
              <option value="">Select airline</option>
              {AIRLINE_OPTIONS.map((airline) => (
                <option key={airline.value} value={airline.value}>
                  {airline.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Report Date</FieldLabel>
            <TextInput
              type="date"
              value={form.reportDate}
              onChange={(e) => handleFormChange("reportDate", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <TextInput
              value={form.shift}
              onChange={(e) => handleFormChange("shift", e.target.value)}
              placeholder="AM / PM / MID / 05:00-13:30"
            />
          </div>

          <div>
            <FieldLabel>Supervisor Reporting</FieldLabel>
            <TextInput
              value={form.supervisorReporting}
              onChange={(e) =>
                handleFormChange("supervisorReporting", e.target.value)
              }
            />
          </div>
        </div>

        {form.airline && (
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
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
                Daily Budget
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {currentBudget.toFixed(2)} hrs
              </div>
            </div>

            <div
              style={{
                background: overBudget ? "#fff1f2" : "#f8fbff",
                border: `1px solid ${overBudget ? "#fecdd3" : "#dbeafe"}`,
                borderRadius: 16,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: overBudget ? "#9f1239" : "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Total Reported
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 22,
                  fontWeight: 900,
                  color: overBudget ? "#9f1239" : "#0f172a",
                }}
              >
                {totalReportedHours.toFixed(2)} hrs
              </div>
            </div>
          </div>
        )}

        {overBudget && (
          <div
            style={{
              marginTop: 16,
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
                marginBottom: 10,
              }}
            >
              Budget Alert
            </div>

            <div
              style={{
                fontSize: 14,
                color: "#9f1239",
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              This timesheet is over budget by {overBudgetBy.toFixed(2)} hours.
            </div>

            <FieldLabel>Why are you over budget?</FieldLabel>
            <TextArea
              value={form.overBudgetReason}
              onChange={(e) =>
                handleFormChange("overBudgetReason", e.target.value)
              }
              placeholder="Explain why this operation exceeded the airline daily budget."
            />
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={form.notes}
            onChange={(e) => handleFormChange("notes", e.target.value)}
            placeholder="Optional station notes"
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: 18, overflow: "hidden" }}>
        <div
          style={{
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Employee Entries
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Select employee names already registered in the system and complete
              the additional fields.
            </p>
          </div>

          <ActionButton onClick={addRow} variant="secondary">
            + Add Row
          </ActionButton>
        </div>

        {loadingEmployees ? (
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
            Loading employees...
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
                minWidth: 1500,
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
                  <th style={thStyle}>Hours</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Remove</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <SelectInput
                        value={row.employeeId}
                        onChange={(e) =>
                          handleRowChange(index, "employeeId", e.target.value)
                        }
                      >
                        <option value="">Select employee</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tdStyle}>
                      <TextInput
                        type="time"
                        value={row.punchIn}
                        onChange={(e) =>
                          handleRowChange(index, "punchIn", e.target.value)
                        }
                      />
                    </td>

                    <td style={tdStyle}>
                      <TextInput
                        type="time"
                        value={row.punchOut}
                        onChange={(e) =>
                          handleRowChange(index, "punchOut", e.target.value)
                        }
                      />
                    </td>

                    <td style={tdStyle}>
                      <SelectInput
                        value={row.employeeStatus}
                        onChange={(e) =>
                          handleRowChange(index, "employeeStatus", e.target.value)
                        }
                      >
                        <option value="">Select status</option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tdStyle}>
                      <SelectInput
                        value={row.breakTaken}
                        onChange={(e) =>
                          handleRowChange(index, "breakTaken", e.target.value)
                        }
                      >
                        {BREAK_OPTIONS.map((breakOption) => (
                          <option key={breakOption} value={breakOption}>
                            {breakOption}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tdStyle}>
                      <TextInput
                        value={row.reason}
                        onChange={(e) =>
                          handleRowChange(index, "reason", e.target.value)
                        }
                        placeholder="Reason / note"
                      />
                    </td>

                    <td style={tdStyle}>
                      <span style={{ fontWeight: 800 }}>
                        {calculateRowHours(row).toFixed(2)} hrs
                      </span>
                    </td>

                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <ActionButton
                        onClick={() => removeRow(index)}
                        variant="danger"
                        disabled={rows.length === 1}
                      >
                        Remove
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit Timesheet"}
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
            Cancel
          </ActionButton>
        </div>
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
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};
