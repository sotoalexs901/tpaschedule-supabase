// src/components/EventRsvpSummary.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

const RSVP_OPTIONS = [
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
          .filter((item) =>
            RSVP_OPTIONS.some(
              (option) =>
                option.key ===
                String(item.response || "")
            )
          );

        setResponses(items);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Error listening to event RSVP responses:",
          error
        );

        setResponses([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventId, enabled]);

  const grouped = useMemo(() => {
    const result = {
      yes: [],
      no: [],
      maybe: [],
      cant: [],
    };

    responses.forEach((item) => {
      const key = String(item.response || "");

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

  if (!enabled) return null;

  const selectedOption = RSVP_OPTIONS.find(
    (option) =>
      option.key === selectedGroup
  );

  const selectedPeople = selectedGroup
    ? grouped[selectedGroup] || []
    : [];

  return (
    <>
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #bfdbfe",
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
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Employee RSVP
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
              : `${responses.length} response${
                  responses.length === 1 ? "" : "s"
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
          {RSVP_OPTIONS.map((option) => {
            const count =
              grouped[option.key]?.length || 0;

            return (
              <button
                key={option.key}
                type="button"
                disabled={loading}
                onClick={() =>
                  setSelectedGroup(option.key)
                }
                style={{
                  border:
                    `1px solid ${option.border}`,
                  background:
                    option.background,
                  color:
                    option.text,
                  borderRadius: 12,
                  padding: "8px 9px",
                  cursor:
                    loading
                      ? "default"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 8,
                  minWidth: 0,
                  opacity:
                    loading ? 0.7 : 1,
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
                  <span
                    style={{
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {option.emoji}
                  </span>

                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {option.label}
                  </span>
                </span>

                <span
                  style={{
                    minWidth: 24,
                    height: 24,
                    borderRadius: 999,
                    background:
                      "rgba(255,255,255,0.78)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 7,
            fontSize: 10,
            color: "#64748b",
          }}
        >
          Tap a response group to view employee names.
        </div>
      </div>

      {selectedGroup && selectedOption && (
        <div
          onClick={() =>
            setSelectedGroup("")
          }
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background:
              "rgba(15,23,42,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              width:
                "min(540px, 100%)",
              maxHeight: "86vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 22,
              border:
                "1px solid #e2e8f0",
              boxShadow:
                "0 30px 80px rgba(15,23,42,0.30)",
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom:
                  `1px solid ${selectedOption.border}`,
                background:
                  selectedOption.background,
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
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.08em",
                    fontWeight: 850,
                    color:
                      selectedOption.text,
                  }}
                >
                  Event RSVP
                </div>

                <h3
                  style={{
                    margin: "4px 0 0",
                    fontSize: 18,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  {selectedOption.emoji}{" "}
                  {selectedOption.label}
                </h3>

                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11.5,
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  {selectedPeople.length} employee
                  {selectedPeople.length === 1
                    ? ""
                    : "s"}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedGroup("")
                }
                style={{
                  border: "none",
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background:
                    "rgba(255,255,255,0.82)",
                  color: "#475569",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 800,
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
                    padding: 16,
                    borderRadius: 14,
                    border:
                      "1px dashed #cbd5e1",
                    color: "#64748b",
                    textAlign: "center",
                    fontSize: 12,
                  }}
                >
                  No employees selected this response.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 9,
                  }}
                >
                  {selectedPeople.map((person) => {
                    const name =
                      getResponderName(person);

                    return (
                      <div
                        key={person.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          border:
                            "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 11,
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background:
                              selectedOption.background,
                            border:
                              `1px solid ${selectedOption.border}`,
                            color:
                              selectedOption.text,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 900,
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(name)}
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 850,
                              color: "#0f172a",
                              wordBreak: "break-word",
                            }}
                          >
                            {name}
                          </div>

                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 10.5,
                              color: "#64748b",
                            }}
                          >
                            {[
                              person.position,
                              person.department,
                            ]
                              .filter(Boolean)
                              .join(" \u00B7 ") ||
                              person.username ||
                              "Team Member"}
                          </div>

                          {formatUpdatedAt(
                            person.updatedAt
                          ) && (
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 9.5,
                                color: "#94a3b8",
                              }}
                            >
                              Updated{" "}
                              {formatUpdatedAt(
                                person.updatedAt
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
