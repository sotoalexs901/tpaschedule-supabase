// src/pages/DraftSchedulesPage.jsx
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
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4d5f-b126-9c6a69f6dcc6",
};

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

function dayShiftsToLines(shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) return ["OFF"];

  const parts = [];
  shifts.forEach((s) => {
    if (!s || !s.start || s.start === "OFF") return;
    parts.push(s.end ? `${s.start}-${s.end}` : s.start);
  });

  return parts.length ? parts : ["OFF"];
}

function formatWeekLabelFromSchedule(schedule) {
  if (!schedule?.days) return "Week not defined";

  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = schedule.days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
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

export default function DraftSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const isErrorStatus =
    statusMessage.toLowerCase().includes("error") ||
    statusMessage.toLowerCase().includes("could not") ||
    statusMessage.toLowerCase().includes("cannot");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setStatusMessage("");

      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const qDrafts = query(
          collection(db, "schedules"),
          where("status", "==", "draft"),
          where("createdBy", "==", user?.username || "")
        );

        const schSnap = await getDocs(qDrafts);

        const draftList = schSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

        setDrafts(draftList);
      } catch (err) {
        console.error("Error loading draft schedules:", err);
        setStatusMessage("Could not load draft schedules.");
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

  const handleOpenDraft = (draft) => {
    navigate("/schedule", {
      state: {
        template: {
          airline: draft.airline,
          airlineDisplayName: draft.airlineDisplayName,
          department: draft.department,
          weekStart: draft.weekStart || "",
          grid: draft.grid,
        },
      },
    });
  };

  const handleExportDraft = (draft) => {
    try {
      const pdf = new jsPDF("landscape", "pt", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 34;
      let y = margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(
        `Draft Schedule: ${draft.airline || "AIRLINE"} — ${
          draft.department || "Department"
        }`,
        margin,
        y
      );
      y += 18;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const weekLabel = formatWeekLabelFromSchedule(draft);
      pdf.text(`Week of: ${weekLabel}`, margin, y);
      y += 24;

      const empColWidth = 130;
      const availableWidth = pageWidth - margin * 2 - empColWidth;
      const dayColWidth = availableWidth / DAY_KEYS.length;
      const headerRowHeight = 22;
      const lineHeight = 10;
      const cellPaddingTop = 8;
      const cellPaddingBottom = 6;

      const drawTableHeader = () => {
        let x = margin;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);

        pdf.rect(x, y, empColWidth, headerRowHeight);
        pdf.text("EMPLOYEE", x + 4, y + 14);
        x += empColWidth;

        DAY_KEYS.forEach((dKey) => {
          const label = DAY_LABELS[dKey];
          pdf.rect(x, y, dayColWidth, headerRowHeight);
          pdf.text(label, x + 4, y + 14);
          x += dayColWidth;
        });

        y += headerRowHeight;
      };

      drawTableHeader();

      const rows = draft.grid || [];

      rows.forEach((row) => {
        const empName =
          employeeNameMap[row.employeeId] || row.employeeId || "Unknown";

        const employeeLines = pdf.splitTextToSize(empName, empColWidth - 8);

        const dayCellLines = DAY_KEYS.map((dKey) => {
          const rawLines = dayShiftsToLines(row[dKey]);
          const wrapped = [];
          rawLines.forEach((line) => {
            const split = pdf.splitTextToSize(String(line), dayColWidth - 6);
            wrapped.push(...split);
          });
          return wrapped.length ? wrapped : ["OFF"];
        });

        const maxLines = Math.max(
          employeeLines.length,
          ...dayCellLines.map((lines) => lines.length)
        );

        const rowHeight =
          cellPaddingTop + maxLines * lineHeight + cellPaddingBottom;

        if (y + rowHeight > pageHeight - margin) {
          pdf.addPage("letter", "landscape");
          y = margin;

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(
            `${draft.airline || "AIRLINE"} — ${
              draft.department || "Department"
            } (cont.)`,
            margin,
            y
          );
          y += 20;

          drawTableHeader();
        }

        let x = margin;

        pdf.setDrawColor(160, 174, 192);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);

        pdf.rect(x, y, empColWidth, rowHeight);
        pdf.text(employeeLines, x + 4, y + cellPaddingTop + 6);
        x += empColWidth;

        DAY_KEYS.forEach((dKey, idx) => {
          const lines = dayCellLines[idx];
          pdf.rect(x, y, dayColWidth, rowHeight);
          pdf.text(lines, x + 3, y + cellPaddingTop + 6);
          x += dayColWidth;
        });

        y += rowHeight;
      });

      pdf.save(
        `Draft_${draft.airline || "AIRLINE"}_${draft.department || "DEPT"}.pdf`
      );
    } catch (err) {
      console.error("Error exporting draft PDF:", err);
      setStatusMessage("Error exporting draft PDF.");
    }
  };

  const handleDeleteDraft = async (draftId) => {
    const ok = window.confirm(
      "Are you sure you want to delete this draft? This cannot be undone."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(collection(db, "schedules"), draftId));
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      setStatusMessage("Draft deleted successfully.");
    } catch (err) {
      console.error("Error deleting draft:", err);
      setStatusMessage("Error deleting draft.");
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
          Loading draft schedules...
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
              Draft Schedules
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Reopen saved drafts, export them to PDF or remove schedules you
              no longer need.
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setStatusMessage("")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background: isErrorStatus ? "#fff1f2" : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: isErrorStatus ? "#9f1239" : "#065f46",
                  letterSpacing: "-0.02em",
                }}
              >
                {isErrorStatus ? "Action Required" : "Success"}
              </div>
            </div>

            <div
              style={{
                padding: "22px 20px 18px",
                fontSize: 15,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => setStatusMessage("")}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "12px 22px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {drafts.length === 0 ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            You don&apos;t have any draft schedules yet.
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
          {drafts.map((draft) => {
            const displayAirline = normalizeAirlineName(
              draft.airlineDisplayName || draft.airline
            );
            const logo =
              AIRLINE_LOGOS[displayAirline] || AIRLINE_LOGOS[draft.airline];

            return (
              <PageCard key={draft.id} style={{ padding: 20 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
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
                        {displayAirline} — {draft.department}
                      </p>

                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                          lineHeight: 1.5,
                        }}
                      >
                        Week: {formatWeekLabelFromSchedule(draft)}
                      </p>
                    </div>

                    {logo && (
                      <img
                        src={logo}
                        alt={displayAirline}
                        style={{
                          width: 46,
                          height: 46,
                          objectFit: "contain",
                          borderRadius: 10,
                          background: "#fff",
                          padding: 4,
                          border: "1px solid #e2e8f0",
                        }}
                      />
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
                        {typeof draft.airlineWeeklyHours === "number"
                          ? draft.airlineWeeklyHours.toFixed(2)
                          : "N/A"}
                      </p>
                    </div>

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
                        Status
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#1769aa",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        Draft
                      </p>
                    </div>
                  </div>

                  {draft.createdAt?.seconds && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Saved on:{" "}
                      {new Date(
                        draft.createdAt.seconds * 1000
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
                      onClick={() => handleOpenDraft(draft)}
                    >
                      Open Draft
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="success"
                      onClick={() => handleExportDraft(draft)}
                    >
                      Export PDF
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="danger"
                      onClick={() => handleDeleteDraft(draft.id)}
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
