// src/pages/ApprovedSchedulesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

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
  if (!days) return "Week not specified";

  return DAY_KEYS.map((k) => {
    const num = days[k];
    const label = DAY_LABELS[k];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

function buildWeekText(schedule) {
  const fromWeekStart = buildDayNumbersFromWeekStart(schedule?.weekStart);
  if (fromWeekStart) {
    return buildWeekTextFromDays(fromWeekStart);
  }

  if (schedule?.days) {
    return buildWeekTextFromDays(schedule.days);
  }

  return "Week not specified";
}

function formatWeekTagLabel(weekTag) {
  if (!weekTag || weekTag === "no-week") return "Unspecified week";

  const d = new Date(`${weekTag}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekTag;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

function ActionButton({ children, onClick, variant = "secondary" }) {
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
  };

  return (
    <button
      type="button"
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

export default function ApprovedSchedulesPage() {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setStatusMessage("");

      try {
        const qApproved = query(
          collection(db, "schedules"),
          where("status", "==", "approved")
        );
        const snap = await getDocs(qApproved);

        const items = snap.docs.map((d) => {
          const data = d.data();
          const resolvedWeekTag =
            String(data.weekStart || data.weekTag || "").trim() || "no-week";

          return {
            id: d.id,
            ...data,
            weekTag: resolvedWeekTag,
          };
        });

        const grouped = {};
        items.forEach((sch) => {
          const key = sch.weekTag || "no-week";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(sch);
        });

        const sortedGrouped = Object.fromEntries(
          Object.entries(grouped).sort((a, b) => {
            if (a[0] === "no-week") return 1;
            if (b[0] === "no-week") return -1;
            return b[0].localeCompare(a[0]);
          })
        );

        setGroups(sortedGrouped);
      } catch (err) {
        console.error("Error loading approved schedules:", err);
        setStatusMessage("Could not load approved schedules.");
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, []);

  const weekTags = useMemo(() => Object.keys(groups), [groups]);

  const handleOpen = (id) => {
    navigate(`/approved/${id}`);
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
          Loading approved schedules...
        </p>
      </PageCard>
    );
  }

  if (!weekTags.length) {
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
            Approved Schedules
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Review approved schedules grouped by week and reopen each one in
            full schedule view.
          </p>
        </div>

        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No approved schedules yet.
          </p>
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
            Approved Schedules
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Browse approved schedules grouped by week and open each one in its
            detailed approved schedule view.
          </p>
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

      {weekTags.map((weekTag) => {
        const list = groups[weekTag];
        const sample = list[0];
        const weekText = buildWeekText(sample);

        return (
          <PageCard key={weekTag} style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 16,
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
                  📁 Week: {weekText}
                </h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  {list.length} schedule{list.length > 1 ? "s" : ""} approved
                  for this week.
                </p>
              </div>

              <div
                style={{
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#1769aa",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {formatWeekTagLabel(weekTag)}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {list.map((sch) => (
                <div
                  key={sch.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 20,
                    padding: 18,
                    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 17,
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
                        margin: "7px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Created by: <b>{sch.createdBy || "N/A"}</b>
                    </p>

                    {sch.weekStart && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        Week start: <b>{sch.weekStart}</b>
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
                          : "0.00"}
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
                          color: "#065f46",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        Approved
                      </p>
                    </div>
                  </div>

                  <div>
                    <ActionButton
                      variant="secondary"
                      onClick={() => handleOpen(sch.id)}
                    >
                      View schedule →
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </PageCard>
        );
      })}
    </div>
  );
}
