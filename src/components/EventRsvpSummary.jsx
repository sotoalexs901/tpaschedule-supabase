// src/components/EventRsvpSummary.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

const STANDARD_OPTIONS = [
  {
    key: "yes",
    label: "Yes",
    emoji: "\u{1F642}",
    background: "#ecfdf5",
    border: "#86efac",
    text: "#166534",
  },
  {
    key: "no",
    label: "No",
    emoji: "\u{1F641}",
    background: "#fff1f2",
    border: "#fda4af",
    text: "#be123c",
  },
  {
    key: "maybe",
    label: "Maybe",
    emoji: "\u{1F615}",
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#a16207",
  },
  {
    key: "cant",
    label: "Sorry, I can't",
    emoji: "\u{1F614}",
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
  },
];

const JOB_OPTIONS = [
  {
    key: "apply",
    label: "Applicants",
    emoji: "\u{1F4BC}",
    background: "#f5f3ff",
    border: "#c4b5fd",
    text: "#6d28d9",
  },
  {
    key: "not_interested",
    label: "Not Interested",
    emoji: "\u{1F6AB}",
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
  },
];

function getResponderName(item) {
  return (
    item?.employeeName ||
    item?.displayName ||
    item?.fullName ||
    item?.name ||
    item?.username ||
    item?.employeeId ||
    "Employee"
  );
}

function getInitials(name) {
  const clean = String(name || "").trim();

  if (!clean) return "U";

  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatUpdatedAt(value) {
  if (!value) return "";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString();
  } catch {
    return "";
  }
}

export default function EventRsvpSummary({
  eventId,
  enabled = false,
}) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [responseMode, setResponseMode] = useState("rsvp");

  useEffect(() => {
    let active = true;

    async function loadEventMode() {
      if (!enabled || !eventId) {
        setResponseMode("rsvp");
        return;
      }

      try {
        const eventSnap = await getDoc(
          doc(
            db,
            "dashboard_events",
            eventId
          )
        );

        if (!active) return;

        if (!eventSnap.exists()) {
          setResponseMode("rsvp");
          return;
        }

        const data = eventSnap.data() || {};

        setResponseMode(
          String(
            data.responseMode ||
              (data.rsvpEnabled ? "rsvp" : "none")
          )
            .trim()
            .toLowerCase()
        );
      } catch (error) {
        console.error(
          "Error loading event response mode:",
          error
        );

        if (active) {
          setResponseMode("rsvp");
        }
      }
    }

    loadEventMode().catch(
      console.error
    );

    return () => {
      active = false;
    };
  }, [eventId, enabled]);

  const options =
    responseMode === "job_posting"
      ? JOB_OPTIONS
      : STANDARD_OPTIONS;

  useEffect(() => {
    if (!enabled || !eventId) {
      setResponses([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const responsesRef = collection(
      db,
      "dashboard_events",
      eventId,
      "responses"
    );

    const unsubscribe = onSnapshot(
      responsesRef,
      (snapshot) => {
        const items = snapshot.docs
          .map((responseDoc) => ({
            id: responseDoc.id,
            ...responseDoc.data(),
          }))
          .filter((item) => {
            const key = String(
              item.response || ""
            )
              .trim()
              .toLowerCase();

            return [
              "yes",
              "no",
              "maybe",
              "cant",
              "apply",
              "not_interested",
            ].includes(key);
          });

        setResponses(items);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Error listening to event responses:",
          error
        );

        setResponses([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventId, enabled]);

  useEffect(() => {
    setSelectedGroup("");
  }, [responseMode, eventId]);

  const grouped = useMemo(() => {
    const result = {
      yes: [],
      no: [],
      maybe: [],
      cant: [],
      apply: [],
      not_interested: [],
    };

    responses.forEach((item) => {
      const key = String(
        item.response || ""
      )
        .trim()
        .toLowerCase();

      if (result[key]) {
        result[key].push(item);
      }
    });

    Object.values(result).forEach((list) => {
      list.sort((a, b) =>
        getResponderName(a).localeCompare(
          getResponderName(b)
        )
      );
    });

    return result;
  }, [responses]);

  if (!enabled || responseMode === "none") {
    return null;
  }

  const selectedOption = options.find(
    (option) =>
      option.key === selectedGroup
  );

  const selectedPeople = selectedGroup
    ? grouped[selectedGroup] || []
    : [];

  const visibleResponseCount = options.reduce(
    (total, option) =>
      total +
      (grouped[option.key]?.length || 0),
    0
  );

  const isJobPosting =
    responseMode === "job_posting";

  return (
    <>
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: isJobPosting
            ? "1px solid #ddd6fe"
            : "1px solid #bfdbfe",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 850,
              color: isJobPosting
                ? "#6d28d9"
                : "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {isJobPosting
              ? "Job Posting Responses"
              : "Employee RSVP"}
          </div>

          <div
            style={{
              fontSize: 10.5,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {loading
              ? "Loading..."
              : `${visibleResponseCount} response${
                  visibleResponseCount === 1 ? "" : "s"
                }`}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: 7,
          }}
        >
          {options.map((option) => {
            const count =
              grouped[option.key]?.length || 0;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() =>
                  setSelectedGroup(
                    option.key
                  )
                }
                style={{
                  border: `1px solid ${option.border}`,
                  background: option.background,
                  color: option.text,
                  borderRadius: 12,
                  padding: "8px 9px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    fontSize: 10.5,
                    fontWeight: 800,
                  }}
                >
                  <span style={{ fontSize: 15 }}>
                    {option.emoji}
                  </span>
                  <span>
                    {option.label}
                  </span>
                </span>

                <strong
                  style={{
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {count}
                </strong>
              </button>
            );
          })}
        </div>

        {isJobPosting && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10.5,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            Select <b>Applicants</b> to view the employees who applied.
          </div>
        )}
      </div>

      {selectedGroup && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() =>
            setSelectedGroup("")
          }
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(15,23,42,0.58)",
            backdropFilter:
              "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "82vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 22,
              border:
                "1px solid #e2e8f0",
              boxShadow:
                "0 30px 80px rgba(15,23,42,0.28)",
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom:
                  "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color:
                      selectedOption?.text ||
                      "#475569",
                    fontWeight: 850,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.06em",
                  }}
                >
                  {isJobPosting
                    ? "Job Posting"
                    : "Event RSVP"}
                </div>

                <h3
                  style={{
                    margin:
                      "4px 0 0",
                    fontSize: 18,
                    color:
                      "#0f172a",
                  }}
                >
                  {selectedOption?.emoji}{" "}
                  {selectedOption?.label}{" "}
                  ({selectedPeople.length})
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedGroup("")
                }
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border:
                    "1px solid #e2e8f0",
                  background:
                    "#f8fafc",
                  cursor:
                    "pointer",
                  fontSize:
                    18,
                }}
              >
                {"\u00D7"}
              </button>
            </div>

            <div
              style={{
                padding: 16,
              }}
            >
              {selectedPeople.length === 0 ? (
                <div
                  style={{
                    padding:
                      18,
                    borderRadius:
                      14,
                    background:
                      "#f8fafc",
                    border:
                      "1px dashed #cbd5e1",
                    textAlign:
                      "center",
                    color:
                      "#64748b",
                    fontSize:
                      12.5,
                  }}
                >
                  No employees in this group.
                </div>
              ) : (
                <div
                  style={{
                    display:
                      "grid",
                    gap: 9,
                  }}
                >
                  {selectedPeople.map(
                    (person) => {
                      const name =
                        getResponderName(
                          person
                        );

                      return (
                        <div
                          key={
                            person.id
                          }
                          style={{
                            borderRadius:
                              14,
                            border:
                              "1px solid #e2e8f0",
                            background:
                              "#ffffff",
                            padding:
                              11,
                            display:
                              "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: 10,
                              minWidth:
                                0,
                            }}
                          >
                            <div
                              style={{
                                width:
                                  38,
                                height:
                                  38,
                                borderRadius:
                                  12,
                                background:
                                  selectedOption?.background ||
                                  "#f8fafc",
                                border: `1px solid ${
                                  selectedOption?.border ||
                                  "#e2e8f0"
                                }`,
                                color:
                                  selectedOption?.text ||
                                  "#475569",
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                fontWeight:
                                  850,
                                flexShrink:
                                  0,
                              }}
                            >
                              {getInitials(
                                name
                              )}
                            </div>

                            <div
                              style={{
                                minWidth:
                                  0,
                              }}
                            >
                              <div
                                style={{
                                  fontSize:
                                    13,
                                  fontWeight:
                                    850,
                                  color:
                                    "#0f172a",
                                  wordBreak:
                                    "break-word",
                                }}
                              >
                                {name}
                              </div>

                              <div
                                style={{
                                  marginTop:
                                    2,
                                  fontSize:
                                    10.5,
                                  color:
                                    "#64748b",
                                }}
                              >
                                {[
                                  person.position,
                                  person.department,
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    " \u00B7 "
                                  ) ||
                                  person.username ||
                                  "Employee"}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign:
                                "right",
                              flexShrink:
                                0,
                              fontSize:
                                9.5,
                              color:
                                "#94a3b8",
                            }}
                          >
                            {formatUpdatedAt(
                              person.updatedAt
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// END EventRsvpSummary.jsx
