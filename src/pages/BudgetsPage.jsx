import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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

const DEPARTMENT_OPTIONS = [
  "Ramp",
  "TC",
  "BSO",
  "Cabin Service",
  "WCHR",
  "Other",
];

function normalizeAirlineName(name) {
  const value = String(name || "").trim();
  const upper = value.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WAL" ||
    upper === "WL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return value;
}

function normalizeDepartmentName(name) {
  const value = String(name || "").trim();

  if (!value) return "";

  const upper = value.toUpperCase();

  if (upper === "TC" || upper === "TICKET COUNTER") return "TC";
  if (upper === "RAMP") return "Ramp";
  if (upper === "BSO") return "BSO";
  if (upper === "WCHR") return "WCHR";
  if (upper === "CABIN" || upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "Cabin Service";
  }
  if (upper === "OTHER") return "Other";

  return value;
}

function startOfTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function startOfCurrentWeekString() {
  const now = new Date();
  const day = now.getDay(); // 0 sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

function formatWeekStartLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "No week assigned";

  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;

  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(
    2,
    "0"
  )}`;
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
  type = "button",
  variant = "primary",
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

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        border: active ? "1px solid #1769aa" : "1px solid #dbeafe",
        background: active ? "#1769aa" : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        boxShadow: active ? "0 10px 22px rgba(23,105,170,0.16)" : "none",
      }}
    >
      {children}
    </button>
  );
}

export default function BudgetsPage() {
  const { user } = useUser();

  const isStationManager = user?.role === "station_manager";
  const isDutyManager = user?.role === "duty_manager";

  const canEditWeekly = isStationManager;
  const canEditDaily = isStationManager || isDutyManager;
  const canCreateWeekly = isStationManager;
  const canCreateDaily = isStationManager || isDutyManager;
  const canDeleteWeekly = isStationManager;
  const canDeleteDaily = isStationManager;

  const [weeklyBudgets, setWeeklyBudgets] = useState([]);
  const [dailyBudgets, setDailyBudgets] = useState([]);
  const [selectedAirline, setSelectedAirline] = useState("SY");
  const [statusMessage, setStatusMessage] = useState("");

  const [weeklyForm, setWeeklyForm] = useState({
    department: "",
    weekStart: startOfCurrentWeekString(),
    weeklyHours: "",
  });

  const [dailyForm, setDailyForm] = useState({
    date: startOfTodayString(),
    dailyHours: "",
  });

  const loadData = async () => {
    try {
      const [weeklySnap, dailySnap] = await Promise.all([
        getDocs(collection(db, "airlineBudgets")),
        getDocs(collection(db, "airlineDailyBudgets")),
      ]);

      const weeklyRows = weeklySnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          airline: normalizeAirlineName(data.airline),
          department: normalizeDepartmentName(data.department),
          budgetHours: Number(data.budgetHours || 0),
          weekStart: String(data.weekStart || ""),
        };
      });

      const dailyRows = dailySnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          airline: normalizeAirlineName(data.airline),
          date: String(data.date || ""),
          dailyBudgetHours:
            data.dailyBudgetHours === null ||
            data.dailyBudgetHours === undefined ||
            data.dailyBudgetHours === ""
              ? ""
              : Number(data.dailyBudgetHours),
        };
      });

      setWeeklyBudgets(weeklyRows);
      setDailyBudgets(dailyRows);
    } catch (err) {
      console.error("Error loading budgets:", err);
      setStatusMessage("Could not load budgets.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const normalizedSelectedAirline = normalizeAirlineName(selectedAirline);

  const selectedWeeklyBudgets = useMemo(() => {
    return weeklyBudgets
      .filter((item) => item.airline === normalizedSelectedAirline)
      .sort((a, b) => {
        const weekCompare = String(b.weekStart || "").localeCompare(String(a.weekStart || ""));
        if (weekCompare !== 0) return weekCompare;
        return String(a.department || "").localeCompare(String(b.department || ""));
      });
  }, [weeklyBudgets, normalizedSelectedAirline]);

  const selectedDailyBudgets = useMemo(() => {
    return dailyBudgets
      .filter((item) => item.airline === normalizedSelectedAirline)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyBudgets, normalizedSelectedAirline]);

  const dailyTotalForSelectedAirline = useMemo(() => {
    return selectedDailyBudgets.reduce(
      (sum, item) => sum + Number(item.dailyBudgetHours || 0),
      0
    );
  }, [selectedDailyBudgets]);

  const createWeeklyBudget = async () => {
    if (!canCreateWeekly) return;

    const airline = normalizeAirlineName(selectedAirline);
    const department = normalizeDepartmentName(weeklyForm.department);
    const weekStart = String(weeklyForm.weekStart || "").trim();
    const weeklyHours = Number(weeklyForm.weeklyHours || 0);

    if (!airline || !department || !weekStart || !weeklyHours) {
      setStatusMessage(
        "Please complete airline, department, week start and weekly budget."
      );
      return;
    }

    try {
      const q = query(
        collection(db, "airlineBudgets"),
        where("airline", "==", airline),
        where("department", "==", department),
        where("weekStart", "==", weekStart)
      );

      const snap = await getDocs(q);

      if (!snap.empty) {
        const existingDoc = snap.docs[0];
        await updateDoc(doc(db, "airlineBudgets", existingDoc.id), {
          budgetHours: weeklyHours,
        });
        setStatusMessage("Weekly budget updated successfully.");
      } else {
        await addDoc(collection(db, "airlineBudgets"), {
          airline,
          department,
          weekStart,
          budgetHours: weeklyHours,
        });
        setStatusMessage("Weekly budget saved successfully.");
      }

      setWeeklyForm((prev) => ({
        ...prev,
        department: "",
        weeklyHours: "",
      }));

      loadData();
    } catch (err) {
      console.error("Error saving weekly budget:", err);
      setStatusMessage("Error saving weekly budget.");
    }
  };

  const createDailyBudget = async () => {
    if (!canCreateDaily) return;

    const airline = normalizeAirlineName(selectedAirline);
    const date = String(dailyForm.date || "").trim();
    const dailyHours = Number(dailyForm.dailyHours || 0);

    if (!airline || !date || !dailyHours) {
      setStatusMessage("Please complete airline, date and daily budget.");
      return;
    }

    try {
      const q = query(
        collection(db, "airlineDailyBudgets"),
        where("airline", "==", airline),
        where("date", "==", date)
      );

      const snap = await getDocs(q);

      if (!snap.empty) {
        const existingDoc = snap.docs[0];
        await updateDoc(doc(db, "airlineDailyBudgets", existingDoc.id), {
          dailyBudgetHours: dailyHours,
        });
        setStatusMessage("Daily budget updated successfully.");
      } else {
        await addDoc(collection(db, "airlineDailyBudgets"), {
          airline,
          date,
          dailyBudgetHours: dailyHours,
        });
        setStatusMessage("Daily budget saved successfully.");
      }

      setDailyForm((prev) => ({
        ...prev,
        dailyHours: "",
      }));

      loadData();
    } catch (err) {
      console.error("Error saving daily budget:", err);
      setStatusMessage("Error saving daily budget.");
    }
  };

  const updateWeeklyBudgetField = async (id, value) => {
    if (!canEditWeekly) return;

    try {
      await updateDoc(doc(db, "airlineBudgets", id), {
        budgetHours: Number(value || 0),
      });
      setStatusMessage("Weekly budget updated.");
      loadData();
    } catch (err) {
      console.error("Error updating weekly budget:", err);
      setStatusMessage("Error updating weekly budget.");
    }
  };

  const updateWeeklyBudgetWeekStart = async (id, value) => {
    if (!canEditWeekly) return;

    try {
      await updateDoc(doc(db, "airlineBudgets", id), {
        weekStart: String(value || "").trim(),
      });
      setStatusMessage("Weekly budget week updated.");
      loadData();
    } catch (err) {
      console.error("Error updating weekly budget week:", err);
      setStatusMessage("Error updating weekly budget week.");
    }
  };

  const updateDailyBudgetField = async (id, value) => {
    if (!canEditDaily) return;

    try {
      await updateDoc(doc(db, "airlineDailyBudgets", id), {
        dailyBudgetHours:
          value === "" || value === null || value === undefined
            ? null
            : Number(value),
      });
      setStatusMessage("Daily budget updated.");
      loadData();
    } catch (err) {
      console.error("Error updating daily budget:", err);
      setStatusMessage("Error updating daily budget.");
    }
  };

  const deleteWeeklyBudget = async (id) => {
    if (!canDeleteWeekly) return;
    if (!window.confirm("Delete this weekly budget?")) return;

    try {
      await deleteDoc(doc(db, "airlineBudgets", id));
      setStatusMessage("Weekly budget deleted.");
      loadData();
    } catch (err) {
      console.error("Error deleting weekly budget:", err);
      setStatusMessage("Error deleting weekly budget.");
    }
  };

  const deleteDailyBudget = async (id) => {
    if (!canDeleteDaily) return;
    if (!window.confirm("Delete this daily budget?")) return;

    try {
      await deleteDoc(doc(db, "airlineDailyBudgets", id));
      setStatusMessage("Daily budget deleted.");
      loadData();
    } catch (err) {
      console.error("Error deleting daily budget:", err);
      setStatusMessage("Error deleting daily budget.");
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
            Weekly budget is managed per airline, department and week start.
            Daily budget is managed per airline and date for timesheet control.
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
            Airline Tabs
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Select the airline first, then manage weekly and daily budgets inside
            that tab.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {AIRLINE_OPTIONS.map((item) => (
            <TabButton
              key={item.value}
              active={selectedAirline === item.value}
              onClick={() => setSelectedAirline(item.value)}
            >
              {item.label}
            </TabButton>
          ))}
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            marginBottom: 16,
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
              Weekly Budget · {selectedAirline}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Used to create schedules. Now matched by airline + department + week start.
            </p>
          </div>

          {!isStationManager && isDutyManager && (
            <div
              style={{
                fontSize: 13,
                color: "#b45309",
                fontWeight: 700,
              }}
            >
              Duty Managers cannot edit weekly budgets.
            </div>
          )}
        </div>

        {canCreateWeekly && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div>
              <FieldLabel>Department</FieldLabel>
              <SelectInput
                value={weeklyForm.department}
                onChange={(e) =>
                  setWeeklyForm((prev) => ({
                    ...prev,
                    department: e.target.value,
                  }))
                }
              >
                <option value="">Select department</option>
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Week Start</FieldLabel>
              <TextInput
                type="date"
                value={weeklyForm.weekStart}
                onChange={(e) =>
                  setWeeklyForm((prev) => ({
                    ...prev,
                    weekStart: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Weekly Budget Hours</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                value={weeklyForm.weeklyHours}
                onChange={(e) =>
                  setWeeklyForm((prev) => ({
                    ...prev,
                    weeklyHours: e.target.value,
                  }))
                }
                placeholder="Example: 22"
              />
            </div>
          </div>
        )}

        {canCreateWeekly && (
          <div style={{ marginBottom: 18 }}>
            <ActionButton onClick={createWeeklyBudget}>
              Save Weekly Budget
            </ActionButton>
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
              minWidth: 980,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle({ textAlign: "left" })}>Airline</th>
                <th style={thStyle({ textAlign: "left" })}>Department</th>
                <th style={thStyle({ textAlign: "left" })}>Week Start</th>
                <th style={thStyle({ textAlign: "left" })}>Weekly Hours</th>
                <th style={thStyle({ textAlign: "center" })}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {selectedWeeklyBudgets.map((item, index) => (
                <tr
                  key={item.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>{item.airline}</td>
                  <td style={tdStyle}>{item.department || "—"}</td>
                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={item.weekStart || ""}
                      disabled={!canEditWeekly}
                      type="date"
                      onBlur={(e) =>
                        canEditWeekly &&
                        updateWeeklyBudgetWeekStart(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 170,
                        background: canEditWeekly ? "#fff" : "#f8fafc",
                        color: canEditWeekly ? "#0f172a" : "#64748b",
                        cursor: canEditWeekly ? "text" : "not-allowed",
                      }}
                    />
                    {!item.weekStart && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#b45309",
                        }}
                      >
                        Legacy record without week
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={item.budgetHours}
                      disabled={!canEditWeekly}
                      type="number"
                      step="0.01"
                      onBlur={(e) =>
                        canEditWeekly &&
                        updateWeeklyBudgetField(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 140,
                        background: canEditWeekly ? "#fff" : "#f8fafc",
                        color: canEditWeekly ? "#0f172a" : "#64748b",
                        cursor: canEditWeekly ? "text" : "not-allowed",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {canDeleteWeekly ? (
                      <ActionButton
                        variant="danger"
                        onClick={() => deleteWeeklyBudget(item.id)}
                      >
                        Delete
                      </ActionButton>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#64748b",
                        }}
                      >
                        Weekly locked
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {selectedWeeklyBudgets.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: 18,
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    No weekly budgets found for {selectedAirline}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            marginBottom: 16,
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
              Daily Budget · {selectedAirline}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Used for timesheets. One total daily budget per airline and date.
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 14,
              padding: "12px 14px",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Stored Daily Total: {dailyTotalForSelectedAirline.toFixed(2)} hrs
          </div>
        </div>

        {canCreateDaily && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={dailyForm.date}
                onChange={(e) =>
                  setDailyForm((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Daily Budget Hours</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                value={dailyForm.dailyHours}
                onChange={(e) =>
                  setDailyForm((prev) => ({
                    ...prev,
                    dailyHours: e.target.value,
                  }))
                }
                placeholder="Example: 44"
              />
            </div>
          </div>
        )}

        {canCreateDaily && (
          <div style={{ marginBottom: 18 }}>
            <ActionButton onClick={createDailyBudget}>
              Save Daily Budget
            </ActionButton>
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
              minWidth: 760,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle({ textAlign: "left" })}>Airline</th>
                <th style={thStyle({ textAlign: "left" })}>Date</th>
                <th style={thStyle({ textAlign: "left" })}>Daily Hours</th>
                <th style={thStyle({ textAlign: "center" })}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {selectedDailyBudgets.map((item, index) => (
                <tr
                  key={item.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>{item.airline}</td>
                  <td style={tdStyle}>{item.date || "—"}</td>
                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={item.dailyBudgetHours}
                      disabled={!canEditDaily}
                      type="number"
                      step="0.01"
                      onBlur={(e) =>
                        canEditDaily &&
                        updateDailyBudgetField(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 140,
                        background: canEditDaily ? "#fff" : "#f8fafc",
                        color: canEditDaily ? "#0f172a" : "#64748b",
                        cursor: canEditDaily ? "text" : "not-allowed",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {canDeleteDaily ? (
                      <ActionButton
                        variant="danger"
                        onClick={() => deleteDailyBudget(item.id)}
                      >
                        Delete
                      </ActionButton>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#64748b",
                        }}
                      >
                        Daily only
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {selectedDailyBudgets.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: 18,
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    No daily budgets found for {selectedAirline}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 16,
            padding: "14px 16px",
            color: "#475569",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "#0f172a" }}>Important:</strong> old weekly budgets are still preserved.
          They will continue showing here as legacy records until you assign a <strong>Week Start</strong>.
          Once a week is added, the regular schedule page can match that budget correctly.
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
