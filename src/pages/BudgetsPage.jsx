import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

function normalizeAirlineName(name) {
  const value = String(name || "").trim();
  const upper = value.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WAL" ||
    upper === "WL HAVANA"
  ) {
    return "WestJet";
  }

  return value;
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

function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [airline, setAirline] = useState("");
  const [department, setDepartment] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [dailyHours, setDailyHours] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const loadBudgets = async () => {
    const snap = await getDocs(collection(db, "airlineBudgets"));
    const arr = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        airline: normalizeAirlineName(data.airline),
        budgetHours: Number(data.budgetHours || 0),
        dailyBudgetHours:
          data.dailyBudgetHours !== undefined && data.dailyBudgetHours !== null
            ? Number(data.dailyBudgetHours)
            : "",
      };
    });
    setBudgets(arr);
  };

  useEffect(() => {
    loadBudgets();
  }, []);

  const createBudget = async () => {
    if (!airline || !weeklyHours) {
      setStatusMessage("Missing info.");
      return;
    }

    try {
      await addDoc(collection(db, "airlineBudgets"), {
        airline: normalizeAirlineName(airline),
        department: String(department || "").trim(),
        budgetHours: Number(weeklyHours),
        dailyBudgetHours:
          dailyHours === "" ? null : Number(dailyHours),
      });

      setAirline("");
      setDepartment("");
      setWeeklyHours("");
      setDailyHours("");
      setStatusMessage("Budget saved successfully.");
      loadBudgets();
    } catch (err) {
      console.error(err);
      setStatusMessage("Error saving budget.");
    }
  };

  const updateBudgetField = async (id, field, value) => {
    try {
      let finalValue = value;

      if (field === "budgetHours") {
        finalValue = Number(value || 0);
      }

      if (field === "dailyBudgetHours") {
        finalValue =
          value === "" || value === null || value === undefined
            ? null
            : Number(value);
      }

      await updateDoc(doc(db, "airlineBudgets", id), {
        [field]: finalValue,
      });

      setStatusMessage("Budget updated.");
      loadBudgets();
    } catch (err) {
      console.error(err);
      setStatusMessage("Error updating budget.");
    }
  };

  const deleteBudget = async (id) => {
    if (!window.confirm("Delete this budget?")) return;

    try {
      await deleteDoc(doc(db, "airlineBudgets", id));
      setStatusMessage("Budget deleted.");
      loadBudgets();
    } catch (err) {
      console.error(err);
      setStatusMessage("Error deleting budget.");
    }
  };

  const success =
    statusMessage.toLowerCase().includes("saved") ||
    statusMessage.toLowerCase().includes("updated") ||
    statusMessage.toLowerCase().includes("deleted");

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
            TPA OPS · Budgets
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
            Airline Budget Config
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Manage weekly budget hours for schedules and daily budget hours for
            timesheet control.
          </p>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: success ? "#ecfdf5" : "#edf7ff",
              border: `1px solid ${success ? "#a7f3d0" : "#cfe7fb"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: success ? "#065f46" : "#1769aa",
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
            Add / Update Budget
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Weekly budget is used for schedules. Daily budget is used for the
            Timesheet Reports page.
          </p>
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
              placeholder="Airline (SY, AV, WestJet...)"
              value={airline}
              onChange={(e) => setAirline(normalizeAirlineName(e.target.value))}
            />
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              placeholder="Department (Ramp, TC, BSO...)"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Weekly Hours</FieldLabel>
            <TextInput
              placeholder="Weekly Hours"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Daily Hours</FieldLabel>
            <TextInput
              placeholder="Daily Hours (for timesheets)"
              value={dailyHours}
              onChange={(e) => setDailyHours(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <ActionButton onClick={createBudget} variant="primary">
            Save Budget
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
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
            Existing Budgets
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Weekly budget stays for scheduling. Daily budget is optional but
            recommended for Timesheet Admin.
          </p>
        </div>

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
                <th style={thStyle({ textAlign: "left" })}>Airline</th>
                <th style={thStyle({ textAlign: "left" })}>Department</th>
                <th style={thStyle({ textAlign: "left" })}>Weekly Hours</th>
                <th style={thStyle({ textAlign: "left" })}>Daily Hours</th>
                <th style={thStyle({ textAlign: "center" })}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {budgets.map((b, index) => (
                <tr
                  key={b.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 700 }}>
                      {normalizeAirlineName(b.airline)}
                    </span>
                  </td>
                  <td style={tdStyle}>{b.department || "—"}</td>

                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={b.budgetHours}
                      onBlur={(e) =>
                        updateBudgetField(b.id, "budgetHours", e.target.value)
                      }
                      style={{ maxWidth: 130 }}
                    />
                  </td>

                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={
                        b.dailyBudgetHours === "" || b.dailyBudgetHours === null
                          ? ""
                          : b.dailyBudgetHours
                      }
                      placeholder="Optional"
                      onBlur={(e) =>
                        updateBudgetField(
                          b.id,
                          "dailyBudgetHours",
                          e.target.value
                        )
                      }
                      style={{ maxWidth: 130 }}
                    />
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ActionButton
                      variant="danger"
                      onClick={() => deleteBudget(b.id)}
                    >
                      Delete
                    </ActionButton>
                  </td>
                </tr>
              ))}

              {budgets.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      padding: "18px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    No budgets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
