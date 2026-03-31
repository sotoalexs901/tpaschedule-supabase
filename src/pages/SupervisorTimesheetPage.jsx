import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
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

const EMPLOYEE_STATUS_OPTIONS = [
  "Present",
  "Late",
  "Call Out",
  "No Show",
  "Sick",
  "Vacation",
  "Suspended",
  "Other",
];

const BREAK_TAKEN_OPTIONS = [
  "Yes",
  "No",
  "30 min",
  "45 min",
  "60 min",
];

const REASON_REQUIRED_STATUSES = new Set([
  "Late",
  "Call Out",
  "No Show",
  "Sick",
  "Other",
]);

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
    breakTaken: "",
    reason: "",
  };
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

export default function SupervisorTimesheetPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [employees, setEmployees] = useState([]);
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
  });

  const [rows, setRows] = useState([emptyRow()]);

  useEffect(() => {
    if (!user) return;

    setForm((prev) => ({
      ...prev,
      supervisorReporting: getVisibleName(user),
      supervisorPosition: user?.position || getDefaultPosition(user?.role),
    }));
  }, [user]);

  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const employeeList = snap.docs
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

        setEmployees(employeeList);
      } catch (err) {
        console.error("Error loading employees:", err);
        setStatusMessage("Could not load employees.");
      } finally {
        setLoadingEmployees(false);
      }
    }

    loadEmployees();
  }, []);

  const employeeMap = useMemo(() => {
    const map = {};
    employees.forEach((emp) => {
      map[emp.id] = emp;
    });
    return map;
  }, [employees]);

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

    if (cleanRows.some((row) => !row.employeeId)) {
      setStatusMessage("Each row must have an employee selected.");
      return;
    }

    if (cleanRows.some((row) => !row.employeeStatus)) {
      setStatusMessage("Please select Employee Status for all rows.");
      return;
    }

    if (cleanRows.some((row) => !row.breakTaken)) {
      setStatusMessage("Please select Break Taken for all rows.");
      return;
    }

    const missingRequiredReason = cleanRows.find(
      (row) =>
        REASON_REQUIRED_STATUSES.has(row.employeeStatus) && !row.reason.trim()
    );

    if (missingRequiredReason) {
      setStatusMessage(
        "Reason is required for Late, Call Out, No Show, Sick and Other."
      );
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
          form.supervisorPosition ||
          user?.position ||
          getDefaultPosition(user?.role),
        notes: form.notes || "",
        rows: cleanRows,
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
      }));

      setRows([emptyRow()]);
    } catch (err) {
      console.error("Error saving timesheet:", err);
      setStatusMessage("Could not submit timesheet.");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
              color: "#9f1239",
              fontWeight: 700,
            }}
          >
            You do not have permission to access the timesheet page.
          </div>
        </PageCard>
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
              Create a timesheet report and send it for manager review.
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
            Report Header
          </h2>
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
                minWidth: 1200,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Employee</th>
                  <th style={thStyle()}>Punch In</th>
                  <th style={thStyle()}>Punch Out</th>
                  <th style={thStyle()}>Employee Status</th>
                  <th style={thStyle()}>Break Taken</th>
                  <th style={thStyle()}>Reason</th>
                  <th style={thStyle({ textAlign: "center" })}>Remove</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => {
                  const reasonRequired = REASON_REQUIRED_STATUSES.has(
                    row.employeeStatus
                  );

                  return (
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
                          {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
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
                          <option value="">Select break</option>
                          {BREAK_TAKEN_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
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
                          placeholder={
                            reasonRequired
                              ? "Reason required"
                              : "Optional reason / note"
                          }
                          style={{
                            borderColor: reasonRequired && !row.reason ? "#fca5a5" : "#dbeafe",
                            background:
                              reasonRequired && !row.reason ? "#fff7f7" : "#ffffff",
                          }}
                        />
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
                  );
                })}
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
