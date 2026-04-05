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
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

function getMonthKey(dateString) {
  const raw = String(dateString || "").trim();
  if (!raw) return "";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const raw = String(monthKey || "").trim();
  if (!raw) return "No month";
  const [year, month] = raw.split("-").map(Number);
  if (!year || !month) return raw;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function getMonthStartFromKey(monthKey) {
  const raw = String(monthKey || "").trim();
  if (!raw) return startOfTodayString();
  return `${raw}-01`;
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
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
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
  const [budgetMonths, setBudgetMonths] = useState([]);

  const [selectedAirline, setSelectedAirline] = useState("SY");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(startOfTodayString()));
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

  const [monthlyForm, setMonthlyForm] = useState({
    finalMonthlyBudgetHours: "",
  });

  const loadData = async () => {
    try {
      const [weeklySnap, dailySnap, monthlySnap] = await Promise.all([
        getDocs(collection(db, "airlineBudgets")),
        getDocs(collection(db, "airlineDailyBudgets")),
        getDocs(collection(db, "budgetMonths")),
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
          monthKey: getMonthKey(data.weekStart),
        };
      });

      const dailyRows = dailySnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          airline: normalizeAirlineName(data.airline),
          date: String(data.date || ""),
          monthKey: getMonthKey(data.date),
          dailyBudgetHours:
            data.dailyBudgetHours === null ||
            data.dailyBudgetHours === undefined ||
            data.dailyBudgetHours === ""
              ? ""
              : Number(data.dailyBudgetHours),
        };
      });

      const monthlyRows = monthlySnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          airline: normalizeAirlineName(data.airline),
          month: String(data.month || ""),
          finalMonthlyBudgetHours:
            data.finalMonthlyBudgetHours === null ||
            data.finalMonthlyBudgetHours === undefined ||
            data.finalMonthlyBudgetHours === ""
              ? ""
              : Number(data.finalMonthlyBudgetHours),
          isClosed: Boolean(data.isClosed),
        };
      });

      setWeeklyBudgets(weeklyRows);
      setDailyBudgets(dailyRows);
      setBudgetMonths(monthlyRows);
    } catch (err) {
      console.error("Error loading budgets:", err);
      setStatusMessage("Could not load budgets.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const normalizedSelectedAirline = normalizeAirlineName(selectedAirline);

  const availableMonths = useMemo(() => {
    const set = new Set();
    weeklyBudgets.forEach((item) => item.monthKey && set.add(item.monthKey));
    dailyBudgets.forEach((item) => item.monthKey && set.add(item.monthKey));
    budgetMonths.forEach((item) => item.month && set.add(item.month));
    set.add(getMonthKey(startOfTodayString()));

    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [weeklyBudgets, dailyBudgets, budgetMonths]);

  useEffect(() => {
    if (!availableMonths.includes(selectedMonth) && availableMonths.length) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    const currentMonthlyDoc = budgetMonths.find(
      (item) =>
        item.airline === normalizedSelectedAirline && item.month === selectedMonth
    );

    setMonthlyForm({
      finalMonthlyBudgetHours:
        currentMonthlyDoc?.finalMonthlyBudgetHours !== "" &&
        currentMonthlyDoc?.finalMonthlyBudgetHours !== undefined
          ? String(currentMonthlyDoc.finalMonthlyBudgetHours)
          : "",
    });
  }, [budgetMonths, normalizedSelectedAirline, selectedMonth]);

  useEffect(() => {
    if (getMonthKey(weeklyForm.weekStart) !== selectedMonth) {
      setWeeklyForm((prev) => ({
        ...prev,
        weekStart: getMonthStartFromKey(selectedMonth),
      }));
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (getMonthKey(dailyForm.date) !== selectedMonth) {
      setDailyForm((prev) => ({
        ...prev,
        date: getMonthStartFromKey(selectedMonth),
      }));
    }
  }, [selectedMonth]);

  const currentMonthDoc = useMemo(() => {
    return (
      budgetMonths.find(
        (item) =>
          item.airline === normalizedSelectedAirline && item.month === selectedMonth
      ) || null
    );
  }, [budgetMonths, normalizedSelectedAirline, selectedMonth]);

  const selectedMonthClosed = Boolean(currentMonthDoc?.isClosed);

  const selectedWeeklyBudgets = useMemo(() => {
    return weeklyBudgets
      .filter(
        (item) =>
          item.airline === normalizedSelectedAirline &&
          item.monthKey === selectedMonth
      )
      .sort((a, b) => {
        const weekCompare = String(b.weekStart || "").localeCompare(String(a.weekStart || ""));
        if (weekCompare !== 0) return weekCompare;
        return String(a.department || "").localeCompare(String(b.department || ""));
      });
  }, [weeklyBudgets, normalizedSelectedAirline, selectedMonth]);

  const selectedDailyBudgets = useMemo(() => {
    return dailyBudgets
      .filter(
        (item) =>
          item.airline === normalizedSelectedAirline &&
          item.monthKey === selectedMonth
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyBudgets, normalizedSelectedAirline, selectedMonth]);

  const weeklyTotalForSelectedMonth = useMemo(() => {
    return selectedWeeklyBudgets.reduce(
      (sum, item) => sum + Number(item.budgetHours || 0),
      0
    );
  }, [selectedWeeklyBudgets]);

  const dailyTotalForSelectedMonth = useMemo(() => {
    return selectedDailyBudgets.reduce(
      (sum, item) => sum + Number(item.dailyBudgetHours || 0),
      0
    );
  }, [selectedDailyBudgets]);

  const finalMonthlyBudget = useMemo(() => {
    if (
      currentMonthDoc?.finalMonthlyBudgetHours !== "" &&
      currentMonthDoc?.finalMonthlyBudgetHours !== undefined &&
      currentMonthDoc?.finalMonthlyBudgetHours !== null
    ) {
      return Number(currentMonthDoc.finalMonthlyBudgetHours || 0);
    }

    return dailyTotalForSelectedMonth || weeklyTotalForSelectedMonth;
  }, [currentMonthDoc, dailyTotalForSelectedMonth, weeklyTotalForSelectedMonth]);

  const createWeeklyBudget = async () => {
    if (!canCreateWeekly || selectedMonthClosed) return;

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

    if (getMonthKey(weekStart) !== selectedMonth) {
      setStatusMessage("The selected week must belong to the selected month.");
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
    if (!canCreateDaily || selectedMonthClosed) return;

    const airline = normalizeAirlineName(selectedAirline);
    const date = String(dailyForm.date || "").trim();
    const dailyHours = Number(dailyForm.dailyHours || 0);

    if (!airline || !date || !dailyHours) {
      setStatusMessage("Please complete airline, date and daily budget.");
      return;
    }

    if (getMonthKey(date) !== selectedMonth) {
      setStatusMessage("The selected date must belong to the selected month.");
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

  const saveMonthlyBudgetConfig = async (isClosingAction = null) => {
    const airline = normalizeAirlineName(selectedAirline);
    const month = String(selectedMonth || "").trim();
    const finalMonthlyBudgetHours = Number(monthlyForm.finalMonthlyBudgetHours || 0);

    if (!airline || !month) {
      setStatusMessage("Please select airline and month.");
      return;
    }

    try {
      const q = query(
        collection(db, "budgetMonths"),
        where("airline", "==", airline),
        where("month", "==", month)
      );

      const snap = await getDocs(q);
      const nextClosedValue =
        typeof isClosingAction === "boolean"
          ? isClosingAction
          : Boolean(currentMonthDoc?.isClosed);

      if (!snap.empty) {
        const existingDoc = snap.docs[0];
        await updateDoc(doc(db, "budgetMonths", existingDoc.id), {
          finalMonthlyBudgetHours,
          isClosed: nextClosedValue,
        });
      } else {
        await addDoc(collection(db, "budgetMonths"), {
          airline,
          month,
          finalMonthlyBudgetHours,
          isClosed: nextClosedValue,
        });
      }

      setStatusMessage(
        nextClosedValue
          ? "Monthly budget saved and month closed."
          : "Monthly budget saved successfully."
      );

      loadData();
    } catch (err) {
      console.error("Error saving monthly budget config:", err);
      setStatusMessage("Error saving monthly budget config.");
    }
  };

  const toggleCloseMonth = async () => {
    const airline = normalizeAirlineName(selectedAirline);
    const month = String(selectedMonth || "").trim();

    if (!airline || !month) {
      setStatusMessage("Please select airline and month.");
      return;
    }

    await saveMonthlyBudgetConfig(!selectedMonthClosed);
  };

  const updateWeeklyBudgetField = async (id, value) => {
    if (!canEditWeekly || selectedMonthClosed) return;

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
    if (!canEditWeekly || selectedMonthClosed) return;

    if (getMonthKey(value) !== selectedMonth) {
      setStatusMessage("Week start must remain inside the selected month.");
      return;
    }

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
    if (!canEditDaily || selectedMonthClosed) return;

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
    if (!canDeleteWeekly || selectedMonthClosed) return;
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
    if (!canDeleteDaily || selectedMonthClosed) return;
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
    statusMessage.toLowerCase().includes("deleted") ||
    statusMessage.toLowerCase().includes("closed") ||
    statusMessage.toLowerCase().includes("reopened");

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
              maxWidth: 820,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Weekly and daily budgets stay exactly as they are today. A new monthly
            layer lets you select a month, save a final monthly budget, and close
            the month when complete without damaging previous records.
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
            Select the airline first, then manage budgets inside that tab.
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
              Monthly Control · {selectedAirline}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Select a month, save the final monthly budget, and close it when complete.
            </p>
          </div>

          <div>
            {selectedMonthClosed ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#fff1f2",
                  color: "#9f1239",
                  border: "1px solid #fecdd3",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Month Closed
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#ecfdf5",
                  color: "#166534",
                  border: "1px solid #a7f3d0",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Month Open
              </span>
            )}
          </div>
        </div>

        <details open>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 800,
              color: "#1769aa",
              marginBottom: 16,
            }}
          >
            Open / Close Monthly Budget Setup
          </summary>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div>
              <FieldLabel>Month</FieldLabel>
              <SelectInput
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthLabel(monthKey)}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Final Monthly Budget Hours</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                value={monthlyForm.finalMonthlyBudgetHours}
                disabled={selectedMonthClosed && !isStationManager}
                onChange={(e) =>
                  setMonthlyForm((prev) => ({
                    ...prev,
                    finalMonthlyBudgetHours: e.target.value,
                  }))
                }
                placeholder="Example: 620"
              />
            </div>

            <div>
              <FieldLabel>Weekly Total in Month</FieldLabel>
              <TextInput value={weeklyTotalForSelectedMonth.toFixed(2)} disabled />
            </div>

            <div>
              <FieldLabel>Daily Total in Month</FieldLabel>
              <TextInput value={dailyTotalForSelectedMonth.toFixed(2)} disabled />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <ActionButton
              onClick={() => saveMonthlyBudgetConfig()}
              disabled={selectedMonthClosed && !isStationManager}
            >
              Save Monthly Budget
            </ActionButton>

            {isStationManager && (
              <ActionButton
                variant={selectedMonthClosed ? "secondary" : "danger"}
                onClick={toggleCloseMonth}
              >
                {selectedMonthClosed ? "Reopen Month" : "Close Month"}
              </ActionButton>
            )}
          </div>

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
            <strong style={{ color: "#0f172a" }}>Monthly dropdown logic:</strong>{" "}
            once a month is closed, the weekly and daily records for that selected month stay
            visible but become locked. This protects April while you start entering May.
          </div>
        </details>
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
              Weekly Budget · {selectedAirline} · {formatMonthLabel(selectedMonth)}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Used to create schedules. Filtered by airline and selected month.
            </p>
          </div>

          {selectedMonthClosed && (
            <div
              style={{
                fontSize: 13,
                color: "#9f1239",
                fontWeight: 800,
              }}
            >
              This month is closed. Weekly budgets are locked.
            </div>
          )}
        </div>

        {canCreateWeekly && !selectedMonthClosed && (
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

        {canCreateWeekly && !selectedMonthClosed && (
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
                      disabled={!canEditWeekly || selectedMonthClosed}
                      type="date"
                      onBlur={(e) =>
                        canEditWeekly &&
                        !selectedMonthClosed &&
                        updateWeeklyBudgetWeekStart(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 170,
                        background:
                          canEditWeekly && !selectedMonthClosed ? "#fff" : "#f8fafc",
                        color:
                          canEditWeekly && !selectedMonthClosed ? "#0f172a" : "#64748b",
                        cursor:
                          canEditWeekly && !selectedMonthClosed ? "text" : "not-allowed",
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
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 700,
                      }}
                    >
                      {formatWeekStartLabel(item.weekStart)}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <TextInput
                      defaultValue={item.budgetHours}
                      disabled={!canEditWeekly || selectedMonthClosed}
                      type="number"
                      step="0.01"
                      onBlur={(e) =>
                        canEditWeekly &&
                        !selectedMonthClosed &&
                        updateWeeklyBudgetField(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 140,
                        background:
                          canEditWeekly && !selectedMonthClosed ? "#fff" : "#f8fafc",
                        color:
                          canEditWeekly && !selectedMonthClosed ? "#0f172a" : "#64748b",
                        cursor:
                          canEditWeekly && !selectedMonthClosed ? "text" : "not-allowed",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {canDeleteWeekly && !selectedMonthClosed ? (
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
                    No weekly budgets found for {selectedAirline} in{" "}
                    {formatMonthLabel(selectedMonth)}.
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
              Daily Budget · {selectedAirline} · {formatMonthLabel(selectedMonth)}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Used for timesheets. Filtered by airline and selected month.
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
            Stored Daily Total: {dailyTotalForSelectedMonth.toFixed(2)} hrs
          </div>
        </div>

        {canCreateDaily && !selectedMonthClosed && (
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

        {canCreateDaily && !selectedMonthClosed && (
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
                      disabled={!canEditDaily || selectedMonthClosed}
                      type="number"
                      step="0.01"
                      onBlur={(e) =>
                        canEditDaily &&
                        !selectedMonthClosed &&
                        updateDailyBudgetField(item.id, e.target.value)
                      }
                      style={{
                        maxWidth: 140,
                        background:
                          canEditDaily && !selectedMonthClosed ? "#fff" : "#f8fafc",
                        color:
                          canEditDaily && !selectedMonthClosed ? "#0f172a" : "#64748b",
                        cursor:
                          canEditDaily && !selectedMonthClosed ? "text" : "not-allowed",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {canDeleteDaily && !selectedMonthClosed ? (
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
                        Daily locked
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
                    No daily budgets found for {selectedAirline} in{" "}
                    {formatMonthLabel(selectedMonth)}.
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
          <strong style={{ color: "#0f172a" }}>Important:</strong> this update does not
          overwrite your existing weekly or daily budget records. It only adds a new monthly
          control layer using the <strong>budgetMonths</strong> collection so you can save a
          final month total and close that month safely.
        </div>

        <div
          style={{
            marginTop: 12,
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 16,
            padding: "14px 16px",
            color: "#475569",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "#0f172a" }}>Current Month Summary:</strong>{" "}
          Weekly Total = {weeklyTotalForSelectedMonth.toFixed(2)} hrs · Daily Total ={" "}
          {dailyTotalForSelectedMonth.toFixed(2)} hrs · Final Monthly Budget ={" "}
          {Number(finalMonthlyBudget || 0).toFixed(2)} hrs.
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
