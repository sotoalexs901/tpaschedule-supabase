// src/pages/SchedulePage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  WestJet: "/logos/westjet.png",
  "WL Havana Air": "/logos/westjet.png",
  "WL Invicta":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_49%20p.m..png?alt=media&token=092a1deb-3285-41e1-ab0c-2e48a8faab92",
  AV: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_37%20p.m..png?alt=media&token=f133d1c8-51f9-4513-96df-8a75c6457b5b",
  EA: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_41%20p.m..png?alt=media&token=13fe584f-078f-4073-8d92-763ac549e5eb",
  WCHR:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_32%20p.m..png?alt=media&token=4f7e9ddd-692b-4288-af0a-8027a1fc6e1c",
  CABIN:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_28%20p.m..png?alt=media&token=b269ad02-0761-4b6b-b2f1-b510365cce49",
  "AA-BSO":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_25%20p.m..png?alt=media&token=09862a10-d237-43e9-a373-8bd07c30ce62",
  OTHER:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4b5f-b126-9c6a69f6dcc6",
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

const toMinutes = (timeStr) => {
  if (!timeStr || timeStr === "OFF") return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const normalizeInterval = (start, end) => {
  const s = toMinutes(start);
  const eRaw = toMinutes(end);
  if (s == null || eRaw == null) return null;
  let e = eRaw;
  if (e <= s) e += 24 * 60;
  return [s, e];
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => {
  const a = normalizeInterval(aStart, aEnd);
  const b = normalizeInterval(bStart, bEnd);
  if (!a || !b) return false;
  const [s1, e1] = a;
  const [s2, e2] = b;
  return s1 < e2 && s2 < e1;
};

const JS_DAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const normalizeAirlineName = (value) => {
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
};

const normalizeDepartmentName = (value) => {
  const raw = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  if (raw === "cabin") return "cabin service";
  if (raw === "cabin service") return "cabin service";
  if (raw === "dl cabin service") return "cabin service";
  if (raw === "ticket counter") return "tc";

  return raw;
};

const getAirlineLogo = (value) =>
  AIRLINE_LOGOS[normalizeAirlineName(value)] || AIRLINE_LOGOS[value] || null;

function buildDayNumbers(weekStart) {
  if (!weekStart) {
    return {
      mon: "",
      tue: "",
      wed: "",
      thu: "",
      fri: "",
      sat: "",
      sun: "",
    };
  }

  const base = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return {
      mon: "",
      tue: "",
      wed: "",
      thu: "",
      fri: "",
      sat: "",
      sun: "",
    };
  }

  const result = {};
  DAY_KEYS.forEach((key, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);
    result[key] = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });

  return result;
}

function buildWeekTagFromWeekStart(weekStart) {
  return String(weekStart || "").trim();
}

function emptyRow() {
  return {
    employeeId: "",
    mon: [{ start: "", end: "" }, { start: "", end: "" }],
    tue: [{ start: "", end: "" }, { start: "", end: "" }],
    wed: [{ start: "", end: "" }, { start: "", end: "" }],
    thu: [{ start: "", end: "" }, { start: "", end: "" }],
    fri: [{ start: "", end: "" }, { start: "", end: "" }],
    sat: [{ start: "", end: "" }, { start: "", end: "" }],
    sun: [{ start: "", end: "" }, { start: "", end: "" }],
  };
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

export default function SchedulePage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [airlineKey, setAirlineKey] = useState("");
  const [airlineDisplayName, setAirlineDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [weekStart, setWeekStart] = useState("");

  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [airlineBudgets, setAirlineBudgets] = useState({});
  const [blockedByEmployee, setBlockedByEmployee] = useState({});
  const [statusMessage, setStatusMessage] = useState("");

  const dayNumbers = useMemo(() => buildDayNumbers(weekStart), [weekStart]);

  useEffect(() => {
    if (location.state?.template) {
      const {
        airline,
        airlineDisplayName,
        department,
        weekStart,
        grid,
      } = location.state.template;

      if (airline) setAirlineKey(normalizeAirlineName(airline));
      if (airlineDisplayName) {
        setAirlineDisplayName(normalizeAirlineName(airlineDisplayName));
      } else if (airline) {
        setAirlineDisplayName(normalizeAirlineName(airline));
      }

      if (department) setDepartment(department);
      if (weekStart) setWeekStart(weekStart);
      if (grid) setRows(grid);
    }
  }, [location.state]);

  useEffect(() => {
    getDocs(collection(db, "employees")).then((snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    getDocs(collection(db, "airlineBudgets")).then((snap) => {
      const map = {};

      snap.docs.forEach((d) => {
        const data = d.data();
        const airline = normalizeAirlineName(data.airline);
        const dept = normalizeDepartmentName(data.department);
        const start = String(data.weekStart || "").trim();

        if (!airline || !dept || !start) return;

        map[`${airline}__${dept}__${start}`] = Number(data.budgetHours || 0);
      });

      setAirlineBudgets(map);
    });
  }, []);

  useEffect(() => {
    async function loadRestrictions() {
      try {
        const snap = await getDocs(collection(db, "restrictions"));
        const byEmp = {};

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const empId = data.employeeId || data.employee_id;
          const startStr = data.start_date || data.startDate;
          const endStr = data.end_date || data.endDate || startStr;

          if (!empId || !startStr) return;

          const start = new Date(startStr);
          const end = new Date(endStr);

          if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

          let current = new Date(start);
          while (current <= end) {
            const jsDay = current.getDay();
            const dayKey = JS_DAY_TO_KEY[jsDay];
            if (dayKey) {
              if (!byEmp[empId]) byEmp[empId] = {};
              byEmp[empId][dayKey] = true;
            }
            current.setDate(current.getDate() + 1);
          }
        });

        setBlockedByEmployee(byEmp);
      } catch (err) {
        console.error("Error loading restrictions:", err);
      }
    }

    loadRestrictions();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setRows([emptyRow()]);
    }
  }, [rows.length]);

  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;
    const s = toMinutes(start);
    const eRaw = toMinutes(end);
    if (s == null || eRaw == null) return 0;
    let e = eRaw;
    if (e < s) e += 24 * 60;

    let hours = (e - s) / 60;
    if (hours > 6 + 1 / 60) {
      hours -= 0.5;
    }
    return hours;
  };

  const calculateTotals = () => {
    let airlineTotal = 0;
    const employeeTotals = {};
    const dailyTotals = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };

    rows.forEach((r) => {
      let employeeWeekly = 0;

      DAY_KEYS.forEach((dKey) => {
        let employeeDay = 0;

        (r[dKey] || []).forEach((shift) => {
          const h = diffHours(shift.start, shift.end);
          employeeDay += h;
        });

        dailyTotals[dKey] += employeeDay;
        employeeWeekly += employeeDay;
      });

      if (r.employeeId) {
        employeeTotals[r.employeeId] = employeeWeekly;
      }
      airlineTotal += employeeWeekly;
    });

    return { employeeTotals, airlineTotal, dailyTotals };
  };

  const { employeeTotals, airlineTotal, dailyTotals } = calculateTotals();

  const budgetKey = `${normalizeAirlineName(airlineKey)}__${normalizeDepartmentName(
    department
  )}__${String(weekStart || "").trim()}`;

  const selectedWeeklyBudget = airlineBudgets[budgetKey] || 0;

  const checkConflictsWithOtherAirlines = async () => {
    const weekTag = buildWeekTagFromWeekStart(weekStart).trim();

    if (!weekTag) {
      return { conflicts: [], weekTag: null };
    }

    const q = query(
      collection(db, "schedules"),
      where("weekTag", "==", weekTag)
    );

    const snap = await getDocs(q);
    const existingSchedules = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    if (!existingSchedules.length) {
      return { conflicts: [], weekTag };
    }

    const empMap = {};
    employees.forEach((e) => {
      empMap[e.id] = e.name;
    });

    const conflicts = [];

    existingSchedules.forEach((sch) => {
      DAY_KEYS.forEach((dayKey) => {
        (sch.grid || []).forEach((oldRow) => {
          (rows || []).forEach((newRow) => {
            if (!newRow.employeeId || newRow.employeeId !== oldRow.employeeId) {
              return;
            }

            const oldShifts = oldRow[dayKey] || [];
            const newShifts = newRow[dayKey] || [];

            oldShifts.forEach((os) => {
              newShifts.forEach((ns) => {
                if (
                  !os.start ||
                  !ns.start ||
                  os.start === "OFF" ||
                  ns.start === "OFF"
                ) {
                  return;
                }

                if (intervalsOverlap(os.start, os.end, ns.start, ns.end)) {
                  conflicts.push({
                    employeeName: empMap[newRow.employeeId] || "Unknown",
                    dayKey,
                    newShift: ns,
                    existingShift: os,
                    otherAirline: sch.airlineDisplayName || sch.airline,
                    otherDept: sch.department,
                  });
                }
              });
            });
          });
        });
      });
    });

    return { conflicts, weekTag };
  };

  const handleSaveDraft = async () => {
    if (!airlineKey || !department || !weekStart) {
      setStatusMessage("Please select airline, department and week start.");
      return;
    }

    try {
      const weekTagToSave = buildWeekTagFromWeekStart(weekStart);

      await addDoc(collection(db, "schedules"), {
        createdAt: serverTimestamp(),
        airline: normalizeAirlineName(airlineKey),
        airlineDisplayName: normalizeAirlineName(
          airlineDisplayName || airlineKey
        ),
        department,
        weekStart,
        days: dayNumbers,
        weekTag: weekTagToSave,
        grid: rows,
        totals: employeeTotals,
        airlineWeeklyHours: airlineTotal,
        airlineDailyHours: dailyTotals,
        budget: selectedWeeklyBudget,
        status: "draft",
        createdBy: user?.username || null,
        role: user?.role || null,
      });

      setStatusMessage("Schedule saved as draft.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Error saving draft.");
    }
  };

  const handleSaveSchedule = async () => {
    if (!airlineKey || !department || !weekStart) {
      setStatusMessage("Please select airline, department and week start.");
      return;
    }

    const { conflicts, weekTag } = await checkConflictsWithOtherAirlines();

    if (conflicts.length > 0) {
      const previewLines = conflicts.slice(0, 6).map((c) => {
        const dayLabel = DAY_LABELS[c.dayKey] || c.dayKey.toUpperCase();
        return `- ${c.employeeName} | ${dayLabel} | ${c.newShift.start}–${c.newShift.end} (already on ${c.otherAirline} — ${c.otherDept} ${c.existingShift.start}–${c.existingShift.end})`;
      });

      const extra =
        conflicts.length > 6
          ? `\n...and ${conflicts.length - 6} more conflicts.`
          : "";

      const proceed = window.confirm(
        "RED FLAG – Employee double assigned in another airline for the same day / time.\n\n" +
          previewLines.join("\n") +
          extra +
          "\n\nDo you still want to submit this schedule?"
      );

      if (!proceed) {
        return;
      }
    }

    try {
      const weekTagToSave = weekTag || buildWeekTagFromWeekStart(weekStart);

      await addDoc(collection(db, "schedules"), {
        createdAt: serverTimestamp(),
        airline: normalizeAirlineName(airlineKey),
        airlineDisplayName: normalizeAirlineName(
          airlineDisplayName || airlineKey
        ),
        department,
        weekStart,
        days: dayNumbers,
        weekTag: weekTagToSave,
        grid: rows,
        totals: employeeTotals,
        airlineWeeklyHours: airlineTotal,
        airlineDailyHours: dailyTotals,
        budget: selectedWeeklyBudget,
        status: "pending",
        createdBy: user?.username || null,
        role: user?.role || null,
      });

      setStatusMessage("Schedule submitted for approval.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Error submitting schedule.");
    }
  };

  const exportPDF = async () => {
    const container = document.getElementById("schedule-print-area");
    if (!container) {
      alert("Printable area not found.");
      return;
    }

    const logoUrl = getAirlineLogo(airlineKey);
    let logoImg = null;

    if (logoUrl) {
      logoImg = await loadImage(logoUrl);
    }

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFFFFF",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();

    if (logoImg) {
      pdf.addImage(logoImg, "PNG", 20, 20, 150, 70);
    }

    const imgData = canvas.toDataURL("image/png");
    const yOffset = logoImg ? 110 : 20;

    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);

    const safeAirline = (airlineDisplayName || airlineKey || "AIRLINE")
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");
    const safeDept = (department || "DEPT").replace(/\s+/g, "_");
    const safeWeek = (weekStart || "week").replace(/[^\d-]/g, "");

    pdf.save(`Schedule_${safeAirline}_${safeDept}_${safeWeek}.pdf`);
  };

  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  const canEditWestJetName = normalizeAirlineName(airlineKey) === "WestJet";

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
              TPA OPS · Scheduling
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
              Create Weekly Schedule
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Build a new weekly schedule, save it as draft, submit it for
              approval, or export it to PDF.
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
            Schedule Setup
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Select airline, department and week start before assigning shifts.
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
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={airlineKey}
              onChange={(e) => {
                const normalizedKey = normalizeAirlineName(e.target.value);
                setAirlineKey(normalizedKey);
                setAirlineDisplayName(normalizedKey);
              }}
            >
              <option value="">Select airline</option>
              <option value="SY">SY</option>
              <option value="WestJet">WestJet</option>
              <option value="WL Invicta">WL Invicta</option>
              <option value="AV">AV</option>
              <option value="EA">EA</option>
              <option value="WCHR">WCHR</option>
              <option value="CABIN">Cabin Service</option>
              <option value="AA-BSO">AA-BSO</option>
              <option value="OTHER">Other</option>
            </SelectInput>

            <div style={{ marginTop: 12 }}>
              <FieldLabel>
                Airline display name {canEditWestJetName ? "(editable)" : "(locked)"}
              </FieldLabel>
              <TextInput
                value={airlineDisplayName}
                disabled={!canEditWestJetName}
                onChange={(e) => setAirlineDisplayName(e.target.value)}
                placeholder="Example: WestJet"
                style={{
                  background: canEditWestJetName ? "#fff" : "#f8fafc",
                  color: canEditWestJetName ? "#0f172a" : "#64748b",
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <SelectInput
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              <option value="Ramp">Ramp</option>
              <option value="TC">Ticket Counter</option>
              <option value="BSO">BSO</option>
              <option value="Cabin Service">Cabin Service</option>
              <option value="WCHR">WCHR</option>
              <option value="Other">Other</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Week Start</FieldLabel>
            <TextInput
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <FieldLabel>Week Dates</FieldLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(70px, 1fr))",
              gap: 10,
            }}
          >
            {DAY_KEYS.map((key) => (
              <div key={key}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {DAY_LABELS[key]}
                </label>
                <TextInput
                  value={dayNumbers[key]}
                  disabled
                  style={{
                    textAlign: "center",
                    padding: "10px 8px",
                    background: "#f8fafc",
                    color: "#475569",
                    fontWeight: 700,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </PageCard>

      <div id="schedule-print-area">
        <ScheduleGrid
          employees={employees}
          dayNumbers={dayNumbers}
          rows={rows}
          setRows={setRows}
          airline={normalizeAirlineName(airlineDisplayName || airlineKey)}
          department={department}
          onSave={handleSaveSchedule}
          onSaveDraft={handleSaveDraft}
          blockedByEmployee={blockedByEmployee}
        />
      </div>

      <PageCard style={{ padding: 20 }}>
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
            Weekly Summary
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Review total hours, daily totals and weekly employee hours before
            exporting or submitting.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Total Hours
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              {airlineTotal.toFixed(2)}
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Weekly Budget
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              {selectedWeeklyBudget}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Daily Hours (All employees)
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
            }}
          >
            {DAY_KEYS.map((dKey) => (
              <div
                key={dKey}
                style={{
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: "12px 14px",
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
                  {DAY_LABELS[dKey]} {dayNumbers[dKey]}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 16,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {dailyTotals[dKey].toFixed(2)} hrs
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Employee Weekly Hours
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 10,
            }}
          >
            {rows.map((r, idx) => {
              if (!r.employeeId) return null;
              const total = employeeTotals[r.employeeId] || 0;
              const over = total > 40;
              const name = employeeNameMap[r.employeeId] || "Unknown";

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: over ? "#fff1f2" : "#f8fbff",
                    border: `1px solid ${over ? "#fecdd3" : "#dbeafe"}`,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      color: over ? "#9f1239" : "#0f172a",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: over ? "#9f1239" : "#0f172a",
                    }}
                  >
                    {total.toFixed(2)} hrs
                  </span>
                </div>
              );
            })}
          </div>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Employees with more than 40 hours in this schedule are highlighted
            in red.
          </p>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ActionButton onClick={handleSaveDraft} variant="secondary">
            Save Draft
          </ActionButton>

          <ActionButton onClick={handleSaveSchedule} variant="primary">
            Submit for Approval
          </ActionButton>

          <ActionButton onClick={exportPDF} variant="success">
            Export PDF
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
