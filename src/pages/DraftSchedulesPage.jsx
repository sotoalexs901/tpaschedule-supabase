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

function getDayNumbers(schedule) {
  return buildDayNumbersFromWeekStart(schedule?.weekStart) || schedule?.days || {};
}

function formatWeekLabelFromSchedule(schedule) {
  const days = getDayNumbers(schedule);

  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
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

function getShiftLine(shifts, index) {
  if (!Array.isArray(shifts) || !shifts[index]) return "OFF";

  const shift = shifts[index];
  if (!shift?.start || shift.start === "OFF") return "OFF";
  if (!shift?.end) return shift.start;

  return `${shift.start} - ${shift.end}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDraftPrintableHtml(draft, employeeNameMap) {
  const displayAirline = normalizeAirlineName(
    draft.airlineDisplayName || draft.airline
  );
  const dayNumbers = getDayNumbers(draft);

  const headerCells = DAY_KEYS.map((key) => {
    const date = dayNumbers[key] || "";
    return `<th>${DAY_LABELS[key]}${date ? ` / ${escapeHtml(date)}` : ""}</th>`;
  }).join("");

  const bodyRows = (draft.grid || [])
    .map((row, index) => {
      const employeeName =
        employeeNameMap[row.employeeId] || row.employeeId || "Unknown";

      const firstShiftRow = DAY_KEYS.map((key) => {
        return `<td>${escapeHtml(getShiftLine(row[key], 0))}</td>`;
      }).join("");

      const secondShiftRow = DAY_KEYS.map((key) => {
        return `<td>${escapeHtml(getShiftLine(row[key], 1))}</td>`;
      }).join("");

      const stripeClass = index % 2 === 0 ? "stripe-a" : "stripe-b";

      return `
        <tr class="${stripeClass}">
          <td class="employee" rowspan="2">${escapeHtml(employeeName)}</td>
          ${firstShiftRow}
        </tr>
        <tr class="${stripeClass}">
          ${secondShiftRow}
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Draft Schedule</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
          }

          .sheet {
            padding: 18px 16px 14px;
          }

          .topbar {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border: 2px solid #222;
            border-bottom: none;
            padding: 14px 16px;
            background: #f3f4f6;
          }

          .title {
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 0.02em;
          }

          .subtitle {
            margin-top: 6px;
            font-size: 13px;
            color: #374151;
            font-weight: 700;
          }

          .status {
            display: inline-flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 999px;
            border: 1px solid #9ca3af;
            background: #ffffff;
            color: #111827;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            white-space: nowrap;
          }

          .meta {
            border: 2px solid #222;
            border-top: none;
            padding: 10px 16px 12px;
            background: #fafafa;
            font-size: 12px;
            color: #374151;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border: 2px solid #222;
            margin-top: 0;
          }

          th, td {
            border: 2px solid #222;
            padding: 8px 6px;
            text-align: center;
            vertical-align: middle;
            font-size: 12px;
            font-weight: 700;
          }

          th {
            background: #d1d5db;
            color: #111827;
            font-size: 12px;
            text-transform: uppercase;
          }

          th:first-child {
            text-align: left;
            width: 170px;
          }

          td.employee {
            text-align: left;
            padding: 12px 10px;
            font-size: 13px;
            font-weight: 800;
          }

          .stripe-a td {
            background: #f9fafb;
          }

          .stripe-b td {
            background: #eceff3;
          }

          .footer {
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
            color: #4b5563;
            font-weight: 700;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .sheet {
              padding: 8px;
            }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="topbar">
            <div>
              <h1 class="title">${escapeHtml(displayAirline)} — ${escapeHtml(
    draft.department || "Department"
  )}</h1>
              <div class="subtitle">WEEKLY SCHEDULE · ${escapeHtml(
                formatWeekLabelFromSchedule(draft)
              )}</div>
            </div>
            <div class="status">Draft</div>
          </div>

          <div class="meta">
            Week start: ${escapeHtml(formatWeekStartLabel(draft.weekStart))} ·
            Created by: ${escapeHtml(draft.createdBy || "N/A")} ·
            Total hours: ${typeof draft.airlineWeeklyHours === "number"
              ? draft.airlineWeeklyHours.toFixed(2)
              : "0.00"}
          </div>

          <table>
            <thead>
              <tr>
                <th>Employee</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
            </tbody>
          </table>

          <div class="footer">
            <div>TPA OPS Schedule Draft</div>
            <div>${escapeHtml(displayAirline)} / ${escapeHtml(
    draft.department || "Department"
  )}</div>
          </div>
        </div>
      </body>
    </html>
  `;
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
          .map((d) => ({
            id: d.id,
            ...d.data(),
            weekTag: String(d.data().weekStart || d.data().weekTag || "").trim(),
          }))
          .sort((a, b) => {
            const aWeek = a.weekTag || "";
            const bWeek = b.weekTag || "";
            if (aWeek !== bWeek) return bWeek.localeCompare(aWeek);

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
          airlineDisplayName: draft.airlineDisplayName || draft.airline,
          department: draft.department,
          weekStart: draft.weekStart || draft.weekTag || "",
          grid: draft.grid,
        },
      },
    });
  };

  const handleExportDraft = (draft) => {
    try {
      const html = buildDraftPrintableHtml(draft, employeeNameMap);
      const printWindow = window.open("", "_blank", "width=1400,height=1000");

      if (!printWindow) {
        alert("Pop-up blocked. Please allow pop-ups to print/export.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      const triggerPrint = () => {
        printWindow.focus();
        printWindow.print();
      };

      setTimeout(triggerPrint, 400);
    } catch (err) {
      console.error("Error exporting draft:", err);
      alert("Error exporting draft. Check console for details.");
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
              Reopen saved drafts, print/export them or remove schedules you no
              longer need.
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

                      {draft.weekStart && (
                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: 12,
                            color: "#64748b",
                            lineHeight: 1.5,
                          }}
                        >
                          Week start: {formatWeekStartLabel(draft.weekStart)}
                        </p>
                      )}
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
                      Export / Print
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
