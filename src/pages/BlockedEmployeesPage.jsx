import React, { useEffect, useMemo, useState } from "react";
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
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
        boxSizing: "border-box",
        minHeight: 46,
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
        boxSizing: "border-box",
        minHeight: 46,
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
  style = {},
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
        minHeight: 42,
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
        ...style,
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

function parseLocalDate(dateStr) {
  const value = String(dateStr || "").trim();
  if (!value) return null;

  const parts = value.split("-");
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeDateInput(dateStr) {
  const date = parseLocalDate(dateStr);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}


function RestrictionCard({
  restriction,
  employeeName,
  onRemove,
  removing,
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid #e2e8f0",
        background: "#ffffff",
        padding: 14,
        display: "grid",
        gap: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: "#0f172a",
              wordBreak: "break-word",
            }}
          >
            {employeeName}
          </div>

          <div
            style={{
              marginTop: 6,
            }}
          >
            <StatusBadge reason={restriction.reason} />
          </div>
        </div>

        <ActionButton
          type="button"
          variant="danger"
          onClick={onRemove}
          disabled={removing}
        >
          {removing ? "Removing..." : "Remove"}
        </ActionButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 12,
            padding: "10px 11px",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Start
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12.5,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {restriction.start_date || "â"}
          </div>
        </div>

        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 12,
            padding: "10px 11px",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            End
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12.5,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {restriction.end_date || "â"}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        Created by: {restriction.createdBy || restriction.role || "â"}
      </div>
    </div>
  );
}

export default function BlockedEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");

  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [form, setForm] = useState({
    employeeId: "",
    reason: "PTO",
    start_date: "",
    end_date: "",
  });

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
            TPA OPS Â· Operations
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
      try {
        setLoading(true);

        const [empSnap, restSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "restrictions")),
        ]);

        setEmployees(
          empSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        );

        setRestrictions(
          restSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
      } catch (err) {
        console.error(err);
        setStatus("Could not load restrictions.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const sortedRestrictions = useMemo(() => {
    return [...restrictions].sort((a, b) => {
      const aStart = normalizeDateInput(a.start_date || "");
      const bStart = normalizeDateInput(b.start_date || "");
      if (aStart !== bStart) return aStart.localeCompare(bStart);

      const aName = String(a.employeeId || "");
      const bName = String(b.employeeId || "");
      return aName.localeCompare(bName);
    });
  }, [restrictions]);

  const filteredRestrictions = useMemo(() => {
    const searchValue = String(search || "").trim().toLowerCase();

    return sortedRestrictions.filter((restriction) => {
      const employeeName = String(
        employees.find((employee) => employee.id === restriction.employeeId)
          ?.name || restriction.employeeId || ""
      ).toLowerCase();

      const reason = String(restriction.reason || "").toLowerCase();

      if (
        reasonFilter !== "ALL" &&
        String(restriction.reason || "") !== reasonFilter
      ) {
        return false;
      }

      if (
        searchValue &&
        !employeeName.includes(searchValue) &&
        !reason.includes(searchValue)
      ) {
        return false;
      }

      return true;
    });
  }, [sortedRestrictions, employees, search, reasonFilter]);

  const activeCount = restrictions.length;
  const employeeCount = new Set(
    restrictions.map((restriction) => restriction.employeeId)
  ).size;

  const addRestriction = async () => {
    const employeeId = String(form.employeeId || "").trim();
    const reason = String(form.reason || "").trim() || "PTO";
    const start_date = normalizeDateInput(form.start_date);
    const end_date = normalizeDateInput(form.end_date || form.start_date);

    if (!employeeId) {
      setStatus("Please select an employee.");
      return;
    }

    if (!start_date) {
      setStatus("Please select a valid start date.");
      return;
    }

    if (!end_date) {
      setStatus("Please select a valid end date.");
      return;
    }

    const startObj = parseLocalDate(start_date);
    const endObj = parseLocalDate(end_date);

    if (!startObj || !endObj) {
      setStatus("Invalid date format.");
      return;
    }

    if (endObj < startObj) {
      setStatus("End date cannot be earlier than start date.");
      return;
    }

    setStatus("Saving restriction...");
    setSaving(true);

    try {
      const payload = {
        employeeId,
        reason,
        start_date,
        end_date,
        role: user.role,
        createdBy: user.username || null,
      };

      const ref = await addDoc(collection(db, "restrictions"), payload);

      setRestrictions((prev) => [...prev, { id: ref.id, ...payload }]);

      setForm({
        employeeId: "",
        reason: "PTO",
        start_date: "",
        end_date: "",
      });

      setStatus("Restriction added.");
    } catch (err) {
      console.error(err);
      setStatus("Error saving restriction.");
    } finally {
      setSaving(false);
    }
  };

  const removeRestriction = async (id) => {
    const confirmed = window.confirm(
      "Remove this employee restriction?"
    );

    if (!confirmed) return;

    try {
      setRemovingId(id);
      await deleteDoc(doc(db, "restrictions", id));
      setRestrictions((prev) => prev.filter((r) => r.id !== id));
      setStatus("Restriction removed.");
    } catch (err) {
      console.error(err);
      setStatus("Error removing restriction.");
    } finally {
      setRemovingId("");
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
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: 1320,
        margin: "0 auto",
        minWidth: 0,
        boxSizing: "border-box",
        padding: isMobile ? "0 2px" : 0,
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 16 : 24,
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
              TPA OPS Â· Operations
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: isMobile ? 26 : 32,
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
                fontSize: isMobile ? 12.5 : 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Manage employee restrictions for PTO, sick leave, day off,
              maternity or suspension to prevent assignment to shifts.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 16,
            padding: isMobile ? "12px 13px" : "14px 16px",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
            Restrictions
          </div>
          <div style={{ marginTop: 5, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>
            {activeCount}
          </div>
        </div>

        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 16,
            padding: isMobile ? "12px 13px" : "14px 16px",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, color: "#047857", textTransform: "uppercase" }}>
            Employees
          </div>
          <div style={{ marginTop: 5, fontSize: 24, fontWeight: 950, color: "#047857" }}>
            {employeeCount}
          </div>
        </div>

        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 16,
            padding: isMobile ? "12px 13px" : "14px 16px",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, color: "#1d4ed8", textTransform: "uppercase" }}>
            PTO
          </div>
          <div style={{ marginTop: 5, fontSize: 24, fontWeight: 950, color: "#1d4ed8" }}>
            {restrictions.filter((item) => String(item.reason) === "PTO").length}
          </div>
        </div>

        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 16,
            padding: isMobile ? "12px 13px" : "14px 16px",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, color: "#b91c1c", textTransform: "uppercase" }}>
            Suspended
          </div>
          <div style={{ marginTop: 5, fontSize: 24, fontWeight: 950, color: "#b91c1c" }}>
            {restrictions.filter((item) => String(item.reason) === "Suspended").length}
          </div>
        </div>
      </div>

      <PageCard style={{ padding: isMobile ? 16 : 22 }}>
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
            Add Restriction
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Use real local dates so restrictions match the correct week start
            and block only the intended days.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Employee</FieldLabel>
            <SelectInput
              value={form.employeeId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, employeeId: e.target.value }))
              }
            >
              <option value="">Select employee</option>
              {employees
                .slice()
                .sort((a, b) =>
                  String(a.name || "").localeCompare(String(b.name || ""))
                )
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name || emp.id}
                  </option>
                ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Reason</FieldLabel>
            <SelectInput
              value={form.reason}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reason: e.target.value }))
              }
            >
              <option value="PTO">PTO</option>
              <option value="Sick">Sick</option>
              <option value="Day Off">Day Off</option>
              <option value="Maternity">Maternity</option>
              <option value="Suspended">Suspended</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Start Date</FieldLabel>
            <TextInput
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, start_date: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>End Date</FieldLabel>
            <TextInput
              type="date"
              value={form.end_date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, end_date: e.target.value }))
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <ActionButton
            onClick={addRestriction}
            variant="primary"
            disabled={saving}
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            {saving ? "Saving..." : "Add Restriction"}
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.3fr 0.7fr",
            gap: 10,
          }}
        >
          <div>
            <FieldLabel>Search</FieldLabel>
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee or reason"
            />
          </div>

          <div>
            <FieldLabel>Reason</FieldLabel>
            <SelectInput
              value={reasonFilter}
              onChange={(event) => setReasonFilter(event.target.value)}
            >
              <option value="ALL">All reasons</option>
              <option value="PTO">PTO</option>
              <option value="Sick">Sick</option>
              <option value="Day Off">Day Off</option>
              <option value="Maternity">Maternity</option>
              <option value="Suspended">Suspended</option>
            </SelectInput>
          </div>
        </div>
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

      <PageCard style={{ padding: isMobile ? 14 : 18 }}>
        <div
          style={{
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 18 : 20,
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
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              {filteredRestrictions.length} record(s) shown.
            </p>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            Loading restrictions...
          </div>
        ) : filteredRestrictions.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            No restrictions match the selected filters.
          </div>
        ) : isMobile ? (
          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            {filteredRestrictions.map((restriction) => (
              <RestrictionCard
                key={restriction.id}
                restriction={restriction}
                employeeName={nameFor(restriction.employeeId)}
                removing={removingId === restriction.id}
                onRemove={() => removeRestriction(restriction.id)}
              />
            ))}
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
                {filteredRestrictions.map((restriction, index) => (
                  <tr
                    key={restriction.id}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{nameFor(restriction.employeeId)}</td>
                    <td style={tdStyle}>
                      <StatusBadge reason={restriction.reason} />
                    </td>
                    <td style={tdStyle}>{restriction.start_date || "â"}</td>
                    <td style={tdStyle}>{restriction.end_date || "â"}</td>
                    <td style={tdStyle}>
                      {restriction.createdBy || restriction.role || "â"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <ActionButton
                        type="button"
                        variant="danger"
                        disabled={removingId === restriction.id}
                        onClick={() => removeRestriction(restriction.id)}
                      >
                        {removingId === restriction.id ? "Removing..." : "Remove"}
                      </ActionButton>
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
