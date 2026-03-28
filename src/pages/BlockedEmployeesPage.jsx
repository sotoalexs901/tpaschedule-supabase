import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
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

function ActionButton({
  children,
  onClick,
  variant = "primary",
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

function StatusBadge({ reason }) {
  const value = String(reason || "").toLowerCase();

  const map = {
    sick: { bg: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    pto: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    maternity: { bg: "#fdf2f8", color: "#9d174d", border: "#fbcfe8" },
    suspended: { bg: "#fff1f2", color: "#9f1239", border: "#fecdd3" },
    "day off": { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
  };

  const style = map[value] || {
    bg: "#f8fafc",
    color: "#334155",
    border: "#e2e8f0",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {reason || "N/A"}
    </span>
  );
}

export default function BlockedEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [status, setStatus] = useState("");
  const { user } = useUser();

  if (
    !user ||
    (user.role !== "station_manager" && user.role !== "duty_manager")
  ) {
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
            TPA OPS · Operations
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
            You are not authorized to manage blocked employees.
          </p>
        </div>

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
            Only Station Managers and Duty Managers can manage restrictions.
          </div>
        </PageCard>
      </div>
    );
  }

  useEffect(() => {
    async function load() {
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const restSnap = await getDocs(collection(db, "restrictions"));
      setRestrictions(restSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load().catch((err) => {
      console.error(err);
      setStatus("Could not load restrictions.");
    });
  }, []);

  const addRestriction = async () => {
    const employeeId = prompt("Employee ID (from Employees table)");
    if (!employeeId) return;

    const reason =
      prompt("Reason (PTO, Sick, Day Off, Maternity, Suspended)") || "PTO";
    const start_date = prompt("Start date (YYYY-MM-DD)") || null;
    const end_date = prompt("End date (YYYY-MM-DD)") || null;

    setStatus("Saving restriction...");

    try {
      const ref = await addDoc(collection(db, "restrictions"), {
        employeeId,
        reason,
        start_date,
        end_date,
        role: user.role,
        createdBy: user.username || null,
      });

      setRestrictions((prev) => [
        ...prev,
        {
          id: ref.id,
          employeeId,
          reason,
          start_date,
          end_date,
          role: user.role,
          createdBy: user.username || null,
        },
      ]);

      setStatus("Restriction added.");
    } catch (err) {
      console.error(err);
      setStatus("Error saving restriction.");
    }
  };

  const removeRestriction = async (id) => {
    try {
      await deleteDoc(doc(db, "restrictions", id));
      setRestrictions((prev) => prev.filter((r) => r.id !== id));
      setStatus("Restriction removed.");
    } catch (err) {
      console.error(err);
      setStatus("Error removing restriction.");
    }
  };

  const nameFor = (id) => employees.find((e) => e.id === id)?.name || id;

  const success =
    status.toLowerCase().includes("added") ||
    status.toLowerCase().includes("removed");

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
              TPA OPS · Operations
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
              Blocked Employees
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Manage employee restrictions for PTO, sick leave, day off,
              maternity or suspension to prevent assignment to shifts.
            </p>
          </div>

          <ActionButton onClick={addRestriction} variant="secondary">
            Add Restriction
          </ActionButton>
        </div>
      </div>

      <PageCard style={{ padding: 18 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: "#64748b",
          }}
        >
          Employees listed here are blocked from being assigned to any shift.
          Restrictions can be created by Station Managers or Duty Managers.
        </p>
      </PageCard>

      {status && (
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
            {status}
          </div>
        </PageCard>
      )}

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
            Current Restrictions
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Review active restriction records and remove them when appropriate.
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
              minWidth: 760,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle({ textAlign: "left" })}>Employee</th>
                <th style={thStyle({ textAlign: "left" })}>Reason</th>
                <th style={thStyle({ textAlign: "left" })}>Start</th>
                <th style={thStyle({ textAlign: "left" })}>End</th>
                <th style={thStyle({ textAlign: "left" })}>Created By</th>
                <th style={thStyle({ textAlign: "center" })}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {restrictions.map((r, index) => (
                <tr
                  key={r.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>{nameFor(r.employeeId)}</td>
                  <td style={tdStyle}>
                    <StatusBadge reason={r.reason} />
                  </td>
                  <td style={tdStyle}>{r.start_date || "-"}</td>
                  <td style={tdStyle}>{r.end_date || "-"}</td>
                  <td style={tdStyle}>{r.createdBy || r.role || "-"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ActionButton
                      type="button"
                      variant="danger"
                      onClick={() => removeRestriction(r.id)}
                    >
                      Remove
                    </ActionButton>
                  </td>
                </tr>
              ))}

              {restrictions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "18px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    No blocked employees.
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
