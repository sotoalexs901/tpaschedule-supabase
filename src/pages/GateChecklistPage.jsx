import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function PageCard({ children, style = {} }) {
  return (
    <div
      className="print-card"
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
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
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
        fontFamily: "inherit",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
  disabled = false,
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#ffffff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#16a34a",
      color: "#ffffff",
      border: "none",
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
        whiteSpace: "nowrap",
        opacity: disabled ? 0.7 : 1,
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SUN COUNTRY (SY)" },
  { value: "AV", label: "AVIANCA (AV)" },
  { value: "WL", label: "WORLD ATLANTIC (WL)" },
];

const BASE_SPECIALS = [
  "BLND",
  "DEAF",
  "LANG",
  "PPOC",
  "INBND WC",
  "OUTBND WC",
  "PETC",
  "SVAN",
  "CBBG",
  "OTHER",
];

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateInputValue(d);
}

function buildChecklistByAirline(airline) {
  const common = [
    {
      time: "70 min prior",
      tasks: [
        "Verify tail #",
        "Complete PCI Verification Log",
        "Load flight",
        "Test printers",
        "Verify inbound gate assignment",
        "Print crew list",
        "Review specials / SSR items",
      ],
    },
    {
      time: "60 min prior",
      tasks: [
        "Aircraft turn clean is conducted",
        "Aircraft search conducted if applicable",
        "International trash cleared if applicable",
      ],
    },
    {
      time: "50 min prior",
      tasks: [
        "Print specials list",
        "Crew IDs verified",
        "Brief crew of any specials",
        "Review unverified list if applicable",
      ],
    },
    {
      time: "45 min prior",
      tasks: [
        "Verify flight status ready for boarding",
        "Process stand-by list if applicable",
        "Begin boarding",
      ],
    },
    {
      time: "15 min prior",
      tasks: [
        "Last BP scanned",
        "Verify boarding count",
        "Check inhibited list if applicable",
      ],
    },
    {
      time: "10 min prior",
      tasks: [
        "Uncheck checked-in not boarded passengers if needed",
        "Verify at 100%",
        "Complete / provide PLR to crew",
        "Review comments list",
      ],
    },
    {
      time: "3 min",
      tasks: [
        "Collect copy of PLR / CLR from crew",
        "Jetbridge / jetway ready to pull",
      ],
    },
    {
      time: "0 min",
      tasks: ["Brake release time", "Push time"],
    },
    {
      time: "Post Departure",
      tasks: [
        "Print final passenger manifest for station files",
        "Resolve late / denied passenger issues",
      ],
    },
    {
      time: "Once airborne",
      tasks: ["Close flight"],
    },
  ];

  if (airline === "AV" || airline === "WL") {
    return [
      common[0],
      {
        time: "60 min prior",
        tasks: [
          "First Pax Off",
          "Last Pax Off",
          "Crew Off",
          "Aircraft turn clean is conducted",
          "Aircraft search conducted if applicable",
          "International trash cleared if applicable",
        ],
      },
      common[2],
      {
        time: "45 min prior",
        tasks: [
          "Verify flight status ready for boarding",
          "Process stand-by list if applicable",
          "Crew On",
          "Begin boarding",
        ],
      },
      {
        time: "15 min prior",
        tasks: [
          "First Pax On",
          "Last BP scanned",
          "Verify boarding count",
          "Check inhibited list if applicable",
        ],
      },
      {
        time: "10 min prior",
        tasks: [
          "Last Pax On",
          "Uncheck checked-in not boarded passengers if needed",
          "Verify at 100%",
          "Complete / provide PLR to crew",
          "Review comments list",
        ],
      },
      {
        time: "3 min",
        tasks: [
          "Collect copy of PLR / CLR from crew",
          "Door Closed",
          "Jetbridge / jetway pulled",
        ],
      },
      common[7],
      common[8],
      common[9],
    ];
  }

  return [
    common[0],
    {
      time: "60 min prior",
      tasks: [
        "Pax deplane",
        "Last Pax Off",
        "Aircraft turn clean is conducted",
        "Aircraft search conducted if applicable",
        "International trash cleared if applicable",
      ],
    },
    common[2],
    common[3],
    common[4],
    common[5],
    {
      time: "3 min",
      tasks: [
        "Collect copy of PLR / CLR from crew",
        "FA closes door",
        "Jetbridge / jetway pulled",
      ],
    },
    common[7],
    common[8],
    common[9],
  ];
}

function getOtpMinutes(scheduledTime, actualTime) {
  if (!scheduledTime || !actualTime) return null;
  const [sh, sm] = String(scheduledTime).split(":").map(Number);
  const [ah, am] = String(actualTime).split(":").map(Number);
  if (
    Number.isNaN(sh) ||
    Number.isNaN(sm) ||
    Number.isNaN(ah) ||
    Number.isNaN(am)
  ) {
    return null;
  }

  const scheduled = sh * 60 + sm;
  let actual = ah * 60 + am;

  if (actual < scheduled - 360) {
    actual += 24 * 60;
  }

  return actual - scheduled;
}

export default function GateChecklistPage() {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    airline: "SY",
    flight: "",
    date: "",
    aircraft: "",
    origin: "",
    destination: "",
    agents: "",
    delayCode: "",
    blockIn: "",
    etd: "",
    actualDepartureTime: "",
    actualArrivalTime: "",
    gpuConnected: "",
    gateAgent1Arrival: "",
    gateAgent2Arrival: "",
    brakeReleaseTime: "",
    pushTime: "",
    checkedBags: "",
    notLoadedBags: "",
    remarks: "",
  });

  const checklistSections = useMemo(
    () => buildChecklistByAirline(form.airline),
    [form.airline]
  );

  const [specials, setSpecials] = useState(
    BASE_SPECIALS.reduce((acc, item) => {
      acc[item] = "";
      return acc;
    }, {})
  );

  const [gateCheck, setGateCheck] = useState({
    bags: "",
    strollersCarSeats: "",
    wchrs: "",
    other: "",
  });

  const [delayAnnouncements, setDelayAnnouncements] = useState(["", "", "", ""]);
  const [actuals, setActuals] = useState({});

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateActual(sectionIndex, taskIndex, value) {
    const key = `${sectionIndex}-${taskIndex}`;
    setActuals((prev) => ({ ...prev, [key]: value }));
  }

  function handlePrint() {
    window.print();
  }

  async function handleSendToAdmin() {
    if (!form.airline || !form.flight || !form.date) {
      setStatusMessage("Please complete airline, flight and date.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      const weekStart = getWeekStart(form.date);
      const month = String(form.date || "").slice(0, 7);

      const otpDepartureMinutes = getOtpMinutes(form.etd, form.pushTime);
      const isOtpDeparture =
        otpDepartureMinutes !== null ? otpDepartureMinutes <= 15 : null;

      await addDoc(collection(db, "gateChecklistReports"), {
        airline: form.airline,
        flight: form.flight,
        date: form.date,
        weekStart,
        month,

        aircraft: form.aircraft || "",
        origin: form.origin || "",
        destination: form.destination || "",
        agents: form.agents || "",
        delayCode: form.delayCode || "",

        blockIn: form.blockIn || "",
        etd: form.etd || "",
        actualDepartureTime: form.actualDepartureTime || "",
        actualArrivalTime: form.actualArrivalTime || "",
        pushTime: form.pushTime || "",
        brakeReleaseTime: form.brakeReleaseTime || "",
        gpuConnected: form.gpuConnected || "",

        gateAgent1Arrival: form.gateAgent1Arrival || "",
        gateAgent2Arrival: form.gateAgent2Arrival || "",

        checkedBags: Number(form.checkedBags || 0),
        notLoadedBags: Number(form.notLoadedBags || 0),

        specials,
        gateCheck,
        delayAnnouncements,
        actuals,
        checklistSections,

        otpDepartureMinutes,
        isOtpDeparture,

        remarks: form.remarks || "",

        submittedBy: getVisibleUserName(user),
        submittedByUserId: user?.id || "",
        createdAt: serverTimestamp(),
        status: "submitted",
      });

      setStatusMessage("Gate checklist sent to admin successfully.");
    } catch (error) {
      console.error("Error sending gate checklist:", error);
      setStatusMessage("Could not send gate checklist.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#0f172a",
      }}
    >
      <style>{`
        @media print {
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
          .print-card {
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
          }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 24,
          padding: 24,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            opacity: 0.85,
          }}
        >
          TPA OPS · Gate Checklist
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          Gate Checklist
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 900,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          Printable gate checklist with admin submission, baggage counts, not
          loaded bags, and OTP tracking by flight and airline.
        </p>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              color: "#1769aa",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 18 }}>
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton variant="primary" onClick={handlePrint}>
              Print
            </ActionButton>

            <ActionButton
              variant="success"
              onClick={handleSendToAdmin}
              disabled={saving}
            >
              {saving ? "Sending..." : "Send to Admin"}
            </ActionButton>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: "-0.03em",
              }}
            >
              Gate Checklist
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr 1.5fr 1fr",
              gap: 8,
            }}
          >
            <div>
              <FieldLabel>Flight</FieldLabel>
              <TextInput
                value={form.flight}
                onChange={(e) => updateField("flight", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>A/C</FieldLabel>
              <TextInput
                value={form.aircraft}
                onChange={(e) => updateField("aircraft", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Orig</FieldLabel>
              <TextInput
                value={form.origin}
                onChange={(e) => updateField("origin", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Dest</FieldLabel>
              <TextInput
                value={form.destination}
                onChange={(e) => updateField("destination", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Agent(s)</FieldLabel>
              <TextInput
                value={form.agents}
                onChange={(e) => updateField("agents", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Delay Code</FieldLabel>
              <TextInput
                value={form.delayCode}
                onChange={(e) => updateField("delayCode", e.target.value)}
              />
            </div>
          </div>

          <div
            className="no-print"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <FieldLabel>Airline</FieldLabel>
              <SelectInput
                value={form.airline}
                onChange={(e) => updateField("airline", e.target.value)}
              >
                {AIRLINE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Block In</FieldLabel>
              <TextInput
                value={form.blockIn}
                onChange={(e) => updateField("blockIn", e.target.value)}
                placeholder="HH:MM"
              />
            </div>

            <div>
              <FieldLabel>ETD</FieldLabel>
              <TextInput
                value={form.etd}
                onChange={(e) => updateField("etd", e.target.value)}
                placeholder="HH:MM"
              />
            </div>

            <div>
              <FieldLabel>Actual Departure Time</FieldLabel>
              <TextInput
                value={form.actualDepartureTime}
                onChange={(e) =>
                  updateField("actualDepartureTime", e.target.value)
                }
                placeholder="HH:MM"
              />
            </div>

            <div>
              <FieldLabel>Actual Arrival Time</FieldLabel>
              <TextInput
                value={form.actualArrivalTime}
                onChange={(e) => updateField("actualArrivalTime", e.target.value)}
                placeholder="HH:MM"
              />
            </div>

            <div>
              <FieldLabel>Checked Bags</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={form.checkedBags}
                onChange={(e) => updateField("checkedBags", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Not Loaded Bags</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={form.notLoadedBags}
                onChange={(e) => updateField("notLoadedBags", e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 0.85fr)",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    <th style={tableHeadStyle}>Time</th>
                    <th style={tableHeadStyle}>Gate Tasks</th>
                    <th style={tableHeadStyle}>Actual</th>
                  </tr>
                </thead>

                <tbody>
                  {checklistSections.map((section, sectionIndex) => (
                    <tr key={section.time}>
                      <td style={{ ...tableCellStyle, width: 120, fontWeight: 800 }}>
                        {section.time}
                      </td>

                      <td style={tableCellStyle}>
                        <div style={{ display: "grid", gap: 8 }}>
                          {section.tasks.map((task, taskIndex) => (
                            <div
                              key={`${section.time}-${taskIndex}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "18px 1fr",
                                gap: 8,
                                alignItems: "start",
                              }}
                            >
                              <div>•</div>
                              <div>{task}</div>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td style={tableCellStyle}>
                        <div style={{ display: "grid", gap: 8 }}>
                          {section.tasks.map((task, taskIndex) => (
                            <TextInput
                              key={`${sectionIndex}-${taskIndex}`}
                              value={actuals[`${sectionIndex}-${taskIndex}`] || ""}
                              onChange={(e) =>
                                updateActual(sectionIndex, taskIndex, e.target.value)
                              }
                              placeholder="Actual"
                              style={{ padding: "8px 10px", fontSize: 12 }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td style={{ ...tableCellStyle, fontWeight: 800 }}>0 min</td>
                    <td style={tableCellStyle}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <div>
                          <FieldLabel>Brake Release Time</FieldLabel>
                          <TextInput
                            value={form.brakeReleaseTime}
                            onChange={(e) =>
                              updateField("brakeReleaseTime", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <FieldLabel>Push Time</FieldLabel>
                          <TextInput
                            value={form.pushTime}
                            onChange={(e) => updateField("pushTime", e.target.value)}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={tableCellStyle}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <PageCard style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  Ops Info
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <FieldLabel>GPU Connected Y or N</FieldLabel>
                    <TextInput
                      value={form.gpuConnected}
                      onChange={(e) => updateField("gpuConnected", e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Gate Agent 1 Arrival Time</FieldLabel>
                    <TextInput
                      value={form.gateAgent1Arrival}
                      onChange={(e) =>
                        updateField("gateAgent1Arrival", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Gate Agent 2 Arrival Time</FieldLabel>
                    <TextInput
                      value={form.gateAgent2Arrival}
                      onChange={(e) =>
                        updateField("gateAgent2Arrival", e.target.value)
                      }
                    />
                  </div>
                </div>
              </PageCard>

              <PageCard style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  Specials
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {BASE_SPECIALS.map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{item}</div>
                      <TextInput
                        value={specials[item]}
                        onChange={(e) =>
                          setSpecials((prev) => ({
                            ...prev,
                            [item]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </PageCard>

              <PageCard style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  Delay Announcements Made (Time)
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {delayAnnouncements.map((item, index) => (
                    <TextInput
                      key={index}
                      value={item}
                      onChange={(e) =>
                        setDelayAnnouncements((prev) =>
                          prev.map((row, i) => (i === index ? e.target.value : row))
                        )
                      }
                    />
                  ))}
                </div>
              </PageCard>

              <PageCard style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  Gate Check
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>BAGS</div>
                    <TextInput
                      value={gateCheck.bags}
                      onChange={(e) =>
                        setGateCheck((prev) => ({ ...prev, bags: e.target.value }))
                      }
                    />
                  </div>

                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>STROLLERS/CARSEATS</div>
                    <TextInput
                      value={gateCheck.strollersCarSeats}
                      onChange={(e) =>
                        setGateCheck((prev) => ({
                          ...prev,
                          strollersCarSeats: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>WCHRS</div>
                    <TextInput
                      value={gateCheck.wchrs}
                      onChange={(e) =>
                        setGateCheck((prev) => ({ ...prev, wchrs: e.target.value }))
                      }
                    />
                  </div>

                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>OTHER</div>
                    <TextInput
                      value={gateCheck.other}
                      onChange={(e) =>
                        setGateCheck((prev) => ({ ...prev, other: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </PageCard>
            </div>
          </div>

          <PageCard style={{ padding: 16 }}>
            <FieldLabel>Notes</FieldLabel>
            <TextArea
              value={form.remarks}
              onChange={(e) => updateField("remarks", e.target.value)}
              placeholder="Add notes here..."
              style={{ minHeight: 120 }}
            />
          </PageCard>
        </div>
      </PageCard>
    </div>
  );
}

const tableHeadStyle = {
  border: "1px solid #94a3b8",
  background: "#f8fafc",
  padding: "10px 12px",
  fontSize: 13,
  textAlign: "left",
  fontWeight: 900,
};

const tableCellStyle = {
  border: "1px solid #94a3b8",
  padding: "10px 12px",
  verticalAlign: "top",
};

const gateCheckRowStyle = {
  display: "grid",
  gridTemplateColumns: "130px 1fr",
  gap: 8,
  alignItems: "center",
};

const gateCheckLabelStyle = {
  fontWeight: 700,
};
