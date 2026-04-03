// src/pages/ReturnedSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import jsPDF from "jspdf";

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

function buildDayNumbersFromWeekStart(weekStart) {
  if (!weekStart) return null;

  const base = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;

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

function buildWeekTextFromDays(days) {
  if (!days) return "Week not defined";

  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

function formatWeekLabelFromSchedule(schedule) {
  const fromWeekStart = buildDayNumbersFromWeekStart(schedule?.weekStart);
  if (fromWeekStart) return buildWeekTextFromDays(fromWeekStart);
  if (schedule?.days) return buildWeekTextFromDays(schedule.days);
  return "Week not defined";
}

function formatWeekStartLabel(weekStart) {
  if (!weekStart) return "Week not specified";

  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekStart;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dayShiftsToText(shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) return "OFF";

  const parts = [];
  shifts.forEach((s) => {
    if (!s || !s.start || s.start === "OFF") return;
    const piece = s.end ? `${s.start}-${s.end}` : s.start;
    parts.push(piece);
  });

  return parts.length ? parts.join(", ") : "OFF";
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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
}) {
  const styles = {
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
      boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
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

export default function ReturnedSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [returned, setReturned] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setStatusMessage("");

      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const qReturned = query(
          collection(db, "schedules"),
          where("status", "==", "returned"),
          where("createdBy", "==", user?.username || "")
        );
        const schSnap = await getDocs(qReturned);

        const list = schSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              weekTag: String(data.weekStart || data.weekTag || "").trim(),
            };
          })
          .sort((a, b) => {
            const aWeek = a.weekTag || "";
            const bWeek = b.weekTag || "";
            if (aWeek !== bWeek) return bWeek.localeCompare(aWeek);

            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

        setReturned(list);
      } catch (err) {
        console.error("Error loading returned schedules:", err);
        setStatusMessage("Could not load returned schedules.");
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, [user?.username]);

  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  const handleOpenReturned = (sch) => {
    navigate("/schedule", {
      state: {
        template: {
          airline: sch.airline,
          airlineDisplayName: sch.airlineDisplayName || sch.airline,
          department: sch.department,
          weekStart: sch.weekStart || sch.weekTag || "",
          grid: sch.grid,
        },
        returnedId: sch.id,
      },
    });
  };

  const handleExportReturned = (sch) => {
    try {
      const pdf = new jsPDF("portrait", "pt", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 40;
      let y = 50;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(
        `Returned Schedule: ${sch.airline || "AIRLINE"} — ${
          sch.department || "Department"
        }`,
        marginX,
        y
      );
      y += 20;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const weekLabel = formatWeekLabelFromSchedule(sch);
      pdf.text(`Week of: ${weekLabel}`, marginX, y);
      y += 16;

      if (sch.weekStart) {
        pdf.text(`Week start: ${formatWeekStartLabel(sch.weekStart)}`, marginX, y);
        y += 16;
      }

      if (sch.returnReason || sch.returnComment || sch.reviewNotes) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Return reason:", marginX, y);
        y += 12;

        pdf.setFont("helvetica", "normal");
        const reasonText =
          sch.returnReason ||
          sch.returnComment ||
          sch.reviewNotes ||
          "(no reason provided)";

        const linesReason = pdf.splitTextToSize(
          reasonText,
          pageWidth - marginX * 2
        );

        linesReason.forEach((ln) => {
          if (y > pageHeight - 40) {
            pdf.addPage();
            y = 40;
          }
          pdf.text(ln, marginX, y);
          y += 12;
        });
        y += 10;
      }

      pdf.setFontSize(9);

      (sch.grid || []).forEach((row) => {
        const empName =
          employeeNameMap[row.employeeId] || row.employeeId || "Unknown";

        const parts = DAY_KEYS.map((dKey) => {
          const dayText = dayShiftsToText(row[dKey]);
          return `${DAY_LABELS[dKey]}: ${dayText}`;
        });

        const line = `${empName}  |  ${parts.join("  |  ")}`;
        const lines = pdf.splitTextToSize(line, pageWidth - marginX * 2);

        lines.forEach((ln) => {
          if (y > pageHeight - 40) {
            pdf.addPage();
            y = 40;
          }
          pdf.text(ln, marginX, y);
          y += 12;
        });

        y += 6;
      });

      const safeWeek = (sch.weekStart || sch.weekTag || "week").replace(/[^\d-]/g, "");
      pdf.save(
        `Returned_${sch.airline || "AIRLINE"}_${sch.department || "DEPT"}_${safeWeek}.pdf`
      );
    } catch (err) {
      console.error("Error exporting returned PDF:", err);
      alert("Error exporting returned PDF. Check console for details.");
    }
  };

  const handleDeleteReturned = async (id) => {
    const ok = window.confirm(
      "Are you sure you want to delete this returned schedule? This cannot be undone."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(collection(db, "schedules"), id));
      setReturned((prev) => prev.filter((s) => s.id !== id));
      setStatusMessage("Returned schedule deleted.");
    } catch (err) {
      console.error("Error deleting returned schedule:", err);
      setStatusMessage("Error deleting returned schedule.");
    }
  };

  if (loading) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading returned schedules...
        </p>
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
              Returned Schedules
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review schedules returned by the Station Manager, fix them,
              export a copy or delete what you no longer need.
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

      {returned.length === 0 ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            You don&apos;t have any returned schedules at the moment.
          </p>
        </PageCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {returned.map((sch) => {
            const reason =
              sch.returnReason || sch.returnComment || sch.reviewNotes || "";

            return (
              <PageCard key={sch.id} style={{ padding: 20 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                      }}
                    >
                      {sch.airline} — {sch.department}
                    </p>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.5,
                      }}
                    >
                      Week: {formatWeekLabelFromSchedule(sch)}
                    </p>

                    {sch.weekStart && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                          lineHeight: 1.5,
                        }}
                      >
                        Week start: {formatWeekStartLabel(sch.weekStart)}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        borderRadius: 14,
                        padding: "12px 14px",
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
                          fontSize: 22,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {typeof sch.airlineWeeklyHours === "number"
                          ? sch.airlineWeeklyHours.toFixed(2)
                          : "N/A"}
                      </p>
                    </div>

                    <div
                      style={{
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: 14,
                        padding: "12px 14px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#9a3412",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Status
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#b45309",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        Returned
                      </p>
                    </div>
                  </div>

                  {reason ? (
                    <div
                      style={{
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        borderRadius: 16,
                        padding: "14px 16px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#9f1239",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Reason
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 13,
                          color: "#881337",
                          lineHeight: 1.55,
                        }}
                      >
                        {reason}
                      </p>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      No reason text was provided.
                    </p>
                  )}

                  {sch.createdAt?.seconds && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Sent on:{" "}
                      {new Date(
                        sch.createdAt.seconds * 1000
                      ).toLocaleString()}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={() => handleOpenReturned(sch)}
                    >
                      Open to Fix
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="success"
                      onClick={() => handleExportReturned(sch)}
                    >
                      Export PDF
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="danger"
                      onClick={() => handleDeleteReturned(sch.id)}
                    >
                      Delete
                    </ActionButton>
                  </div>
                </div>
              </PageCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
