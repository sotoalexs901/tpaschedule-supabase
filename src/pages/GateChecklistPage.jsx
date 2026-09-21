import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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
    isMobile: width < 720,
    isTablet: width >= 720 && width < 1280,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      className="print-card"
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children, className = "" }) {
  return (
    <label
      className={className}
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 10.5,
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

const TextInput = React.forwardRef(function TextInput(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={`print-input ${props.className || ""}`}
      style={{
        width: "100%",
        minWidth: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "8px 10px",
        minHeight: 40,
        fontSize: 13,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
});

const TimeInput = React.forwardRef(function TimeInput(props, ref) {
  return (
    <input
      ref={ref}
      type="time"
      step="60"
      {...props}
      className={`print-time ${props.className || ""}`}
      style={{
        width: "100%",
        minWidth: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "8px 10px",
        minHeight: 40,
        fontSize: 13,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
});

function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`print-textarea ${props.className || ""}`}
      style={{
        width: "100%",
        minWidth: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "8px 10px",
        minHeight: 40,
        fontSize: 13,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
        fontFamily: "inherit",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      className={`print-select ${props.className || ""}`}
      style={{
        width: "100%",
        minWidth: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "8px 10px",
        fontSize: 13,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
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
    warning: {
      background: "#f59e0b",
      color: "#ffffff",
      border: "none",
    },
    danger: {
      background: "#dc2626",
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
        minHeight: 42,
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.7 : 1,
        ...variants[variant],
        ...style,
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
        "Flight Close",
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
      tasks: ["AC Off"],
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
          "Flight Close",
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
        "First Pax Off",
        "Last Pax Off",
        "Aircraft turn clean is conducted",
        "Aircraft search conducted if applicable",
        "International trash cleared if applicable",
      ],
    },
    common[2],
    common[3],
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
        "Flight Close",
      ],
    },
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

function toMinutesFromTime(value) {
  if (!value || !String(value).includes(":")) return null;

  const [h, m] = String(value).split(":").map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  return h * 60 + m;
}

function minutesToTime(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";

  let total = Number(value);
  while (total < 0) total += 24 * 60;
  total = total % (24 * 60);

  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");

  return `${hh}:${mm}`;
}

function getAirlineTurnRules(airline) {
  if (airline === "WL") {
    return {
      minTurnMinutes: 90,
      boardingOffsetMinutes: 15,
    };
  }

  if (airline === "AV") {
    return {
      minTurnMinutes: 85,
      boardingOffsetMinutes: 15,
    };
  }

  return {
    minTurnMinutes: 45,
    boardingOffsetMinutes: 10,
  };
}

function calculateNewStdAndDeadline(airline, blockIn, std) {
  const blockInMinutes = toMinutesFromTime(blockIn);
  const stdMinutes = toMinutesFromTime(std);
  const rules = getAirlineTurnRules(airline);

  if (stdMinutes === null) {
    return {
      newStd: "",
      boardingDeadline: "",
    };
  }

  let referenceStdMinutes = stdMinutes;

  if (blockInMinutes !== null) {
    let adjustedStdMinutes = stdMinutes;

    if (adjustedStdMinutes < blockInMinutes) {
      adjustedStdMinutes += 24 * 60;
    }

    const currentTurnMinutes = adjustedStdMinutes - blockInMinutes;

    if (currentTurnMinutes < rules.minTurnMinutes) {
      referenceStdMinutes = blockInMinutes + rules.minTurnMinutes;

      return {
        newStd: minutesToTime(referenceStdMinutes),
        boardingDeadline: minutesToTime(
          referenceStdMinutes - rules.boardingOffsetMinutes
        ),
      };
    }
  }

  return {
    newStd: "",
    boardingDeadline: minutesToTime(
      referenceStdMinutes - rules.boardingOffsetMinutes
    ),
  };
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const DUPLICATE_TASK_FIELD_MAP = {
  "First Pax Off": "firstPaxOff",
  "Last Pax Off": "lastPaxOff",
  "First Pax On": "firstPaxOn",
  "Last Pax On": "lastPaxOn",
  "Brake release time": "brakeReleaseTime",
  "Push time": "pushTime",
};

function getMappedTaskField(task) {
  return DUPLICATE_TASK_FIELD_MAP[String(task || "").trim()] || "";
}

function buildPrintableGateChecklistHtml({
  form,
  specials,
  gateCheck,
  delayAnnouncements,
  checklistSections,
  actuals,
  currentStatus,
  user,
}) {
  const card = (label, value) => `
    <div class="info-card">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value || "-")}</div>
    </div>
  `;

  const mappedActual = (task, sectionIndex, taskIndex) => {
    const field = getMappedTaskField(task);
    if (field) return form?.[field] || "";
    return actuals?.[`${sectionIndex}-${taskIndex}`] || "";
  };

  const checklistRows = (checklistSections || [])
    .flatMap((section, sectionIndex) =>
      (section.tasks || []).map(
        (task, taskIndex) => `
          <tr>
            <td>${escapeHtml(section.time || "-")}</td>
            <td>${escapeHtml(task || "-")}</td>
            <td>${escapeHtml(mappedActual(task, sectionIndex, taskIndex) || "-")}</td>
          </tr>
        `
      )
    )
    .join("");

  const specialsRows = Object.entries(specials || {})
    .filter(([, value]) => String(value || "").trim() !== "")
    .map(
      ([key, value]) => `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join("");

  const delayRows = (delayAnnouncements || [])
    .filter((value) => String(value || "").trim() !== "")
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>AeroStation Hub - Gate Checklist</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
            background: #fff;
          }
          .brand {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            border-bottom: 3px solid #1769aa;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .brand-kicker {
            font-size: 11px;
            font-weight: 800;
            color: #1769aa;
            letter-spacing: .12em;
            text-transform: uppercase;
          }
          h1 {
            margin: 5px 0 0;
            font-size: 28px;
            line-height: 1.05;
          }
          .status {
            padding: 7px 11px;
            border-radius: 999px;
            border: 1px solid #cfe7fb;
            background: #edf7ff;
            color: #1769aa;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .section {
            margin-top: 16px;
            page-break-inside: avoid;
          }
          .section-title {
            margin: 0 0 9px;
            font-size: 15px;
            font-weight: 900;
            color: #0f172a;
            border-left: 4px solid #1769aa;
            padding-left: 8px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }
          .info-card {
            border: 1px solid #dbeafe;
            background: #f8fbff;
            border-radius: 10px;
            padding: 9px 10px;
          }
          .label {
            font-size: 9px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: .06em;
          }
          .value {
            margin-top: 4px;
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            word-break: break-word;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 7px 8px;
            text-align: left;
            vertical-align: top;
            font-size: 10px;
          }
          th {
            background: #f8fbff;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: .04em;
            font-size: 9px;
          }
          .notes {
            border: 1px solid #dbeafe;
            border-radius: 10px;
            padding: 10px 12px;
            background: #f8fbff;
            font-size: 11px;
            line-height: 1.55;
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            color: #94a3b8;
            font-size: 9px;
          }
  
        @media screen and (max-width: 1279px) {
          .print-side-cards {
            align-items: start;
          }

          .print-main-card {
            border-radius: 14px !important;
          }
        }

        @media screen and (max-width: 719px) {
          .print-table th,
          .print-table td {
            padding: 7px 8px !important;
          }

          .print-card {
            border-radius: 14px !important;
          }
        }

        @media print {
            body { margin: 12px; }
            .section { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="brand">
          <div>
            <div class="brand-kicker">AeroStation Hub | Operational Management Platform</div>
            <h1>Gate Checklist Report</h1>
          </div>
          <div class="status">${escapeHtml(currentStatus || "new")}</div>
        </div>

        <div class="section">
          <div class="section-title">Flight Information</div>
          <div class="grid">
            ${card("Airline", form.airline)}
            ${card("Flight", form.flight)}
            ${card("Date", form.date)}
            ${card("Aircraft", form.aircraft)}
            ${card("Origin", form.origin)}
            ${card("Destination", form.destination)}
            ${card("Gate Agent", form.gateAgent)}
            ${card("Expeditor", form.expeditor)}
            ${card("Supervisor", form.supervisor)}
            ${card("STD", form.std)}
            ${card("New STD", form.newStd)}
            ${card(form.airline === "SY" ? "D-10" : "D-15", form.boardingDeadline)}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Timing & Performance</div>
          <div class="grid">
            ${card("Block In", form.blockIn)}
            ${card("Actual Arrival", form.actualArrivalTime)}
            ${card("Actual Departure", form.actualDepartureTime)}
            ${card("Brake Release", form.brakeReleaseTime)}
            ${card("Push Time", form.pushTime)}
            ${card("GPU Connected", form.gpuConnected)}
            ${card("Gate Agent 1 Arrival", form.gateAgent1Arrival)}
            ${card("Gate Agent 2 Arrival", form.gateAgent2Arrival)}
            ${card("Delay", form.delay)}
            ${card("Delay Minutes", form.delayTimeMinutes)}
            ${card("Delay Code", form.delayCode)}
            ${card("Controllable", form.controllable)}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Passenger & Baggage</div>
          <div class="grid">
            ${card("Final Total Pax", form.finalTotalPax)}
            ${card("Total IB Pax", form.totalIbPax)}
            ${card("First Pax Off", form.firstPaxOff)}
            ${card("Last Pax Off", form.lastPaxOff)}
            ${card("First Pax On", form.firstPaxOn)}
            ${card("Last Pax On", form.lastPaxOn)}
            ${card("Checked Bags", form.checkedBags)}
            ${card("Not Loaded Bags", form.notLoadedBags)}
            ${card("Gate Check Bags", gateCheck?.bags)}
            ${card("Strollers / Car Seats", gateCheck?.strollersCarSeats)}
            ${card("Gate Check WCHRs", gateCheck?.wchrs)}
            ${card("Gate Check Other", gateCheck?.other)}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Specials</div>
          <table>
            <thead><tr><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              ${specialsRows || `<tr><td colspan="2">No specials reported.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Delay Announcements</div>
          ${delayRows ? `<ul>${delayRows}</ul>` : `<div class="notes">No delay announcements reported.</div>`}
        </div>

        <div class="section">
          <div class="section-title">Operational Checklist</div>
          <table>
            <thead>
              <tr><th style="width:16%">Time</th><th>Task</th><th style="width:22%">Actual</th></tr>
            </thead>
            <tbody>
              ${checklistRows || `<tr><td colspan="3">No checklist data.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Notes</div>
          <div class="notes">${escapeHtml(form.remarks || "No notes.")}</div>
        </div>

        <div class="footer">
          AeroStation Hub | Generated by ${escapeHtml(getVisibleUserName(user))}
        </div>
      </body>
    </html>
  `;
}

function createInitialSpecials() {
  return BASE_SPECIALS.reduce((acc, item) => {
    acc[item] = "";
    return acc;
  }, {});
}

function createInitialGateCheck() {
  return {
    bags: "",
    strollersCarSeats: "",
    wchrs: "",
    other: "",
  };
}

function createInitialForm(user) {
  const loggedName = getVisibleUserName(user);

  return {
    airline: "SY",
    flight: "",
    date: "",
    aircraft: "",
    origin: "",
    destination: "",
    finalTotalPax: "",
    totalIbPax: "",
    delayCode: "",
    delay: "No",
    delayTimeMinutes: "",
    controllable: "No",
    blockIn: "",
    std: "",
    newStd: "",
    boardingDeadline: "",
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
    gateAgent: loggedName,
    expeditor: "",
    supervisor: "",
    firstPaxOff: "",
    lastPaxOff: "",
    firstPaxOn: "",
    lastPaxOn: "",
  };
}

function hasChecklistDependentData(form, specials, gateCheck, delayAnnouncements, actuals) {
  const formFieldsToCheck = [
    "flight",
    "aircraft",
    "origin",
    "destination",
    "finalTotalPax",
    "totalIbPax",
    "delayCode",
    "delayTimeMinutes",
    "blockIn",
    "newStd",
    "boardingDeadline",
    "actualDepartureTime",
    "actualArrivalTime",
    "gpuConnected",
    "gateAgent1Arrival",
    "gateAgent2Arrival",
    "brakeReleaseTime",
    "pushTime",
    "checkedBags",
    "notLoadedBags",
    "remarks",
    "expeditor",
    "supervisor",
    "firstPaxOff",
    "lastPaxOff",
    "firstPaxOn",
    "lastPaxOn",
  ];

  const formHasData = formFieldsToCheck.some((key) => {
    const value = form[key];
    return String(value || "").trim() !== "";
  });

  const specialsHasData = Object.values(specials || {}).some(
    (value) => String(value || "").trim() !== ""
  );

  const gateCheckHasData = Object.values(gateCheck || {}).some(
    (value) => String(value || "").trim() !== ""
  );

  const delayAnnouncementsHasData = (delayAnnouncements || []).some(
    (value) => String(value || "").trim() !== ""
  );

  const actualsHasData = Object.values(actuals || {}).some(
    (value) => String(value || "").trim() !== ""
  );

  return (
    formHasData ||
    specialsHasData ||
    gateCheckHasData ||
    delayAnnouncementsHasData ||
    actualsHasData
  );
}

export default function GateChecklistPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const flightRef = useRef(null);

  const isSupervisorOrManager =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [saving, setSaving] = useState(false);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [lookupDate, setLookupDate] = useState("");
  const [lookupAirline, setLookupAirline] = useState("SY");

  const [editingId, setEditingId] = useState("");
  const [currentStatus, setCurrentStatus] = useState("new");

  const [form, setForm] = useState(() => createInitialForm(user));
  const [specials, setSpecials] = useState(createInitialSpecials());
  const [gateCheck, setGateCheck] = useState(createInitialGateCheck());
  const [delayAnnouncements, setDelayAnnouncements] = useState(["", "", "", ""]);
  const [actuals, setActuals] = useState({});

  const checklistSections = useMemo(
    () => buildChecklistByAirline(form.airline),
    [form.airline]
  );

  const isExisting = !!editingId;
  const isClosed = currentStatus === "closed";
  const isSubmitted = currentStatus === "submitted";

  const stdUnlocked = !!String(form.std || "").trim();

  const canEdit = !isClosed;
  const canReopen = isExisting && (isSubmitted || isClosed) && isSupervisorOrManager;
  const canClose = isExisting;
  const canSubmit =
    !!form.airline && !!form.flight && !!form.date && !!form.std && canEdit;

  useEffect(() => {
    const { newStd, boardingDeadline } = calculateNewStdAndDeadline(
      form.airline,
      form.blockIn,
      form.std
    );

    setForm((prev) => {
      if (
        prev.newStd === newStd &&
        prev.boardingDeadline === boardingDeadline
      ) {
        return prev;
      }

      return {
        ...prev,
        newStd,
        boardingDeadline,
      };
    });
  }, [form.airline, form.blockIn, form.std]);

  function getTaskActualValue(task, sectionIndex, taskIndex) {
    const mappedField = getMappedTaskField(task);

    if (mappedField) {
      return form[mappedField] || "";
    }

    return actuals[`${sectionIndex}-${taskIndex}`] || "";
  }

  function updateTaskActual(task, sectionIndex, taskIndex, value) {
    const mappedField = getMappedTaskField(task);

    if (mappedField) {
      updateField(mappedField, value);
      return;
    }

    updateActual(sectionIndex, taskIndex, value);
  }

  function clearDependentSections() {
    setSpecials(createInitialSpecials());
    setGateCheck(createInitialGateCheck());
    setDelayAnnouncements(["", "", "", ""]);
    setActuals({});
  }

  function resetDependentFieldsKeepingBase(prev, overrides = {}) {
    return {
      ...prev,
      flight: "",
      aircraft: "",
      origin: "",
      destination: "",
      finalTotalPax: "",
      totalIbPax: "",
      delayCode: "",
      delay: "No",
      delayTimeMinutes: "",
      controllable: "No",
      blockIn: "",
      std: "",
      newStd: "",
      boardingDeadline: "",
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
      expeditor: "",
      supervisor: "",
      firstPaxOff: "",
      lastPaxOff: "",
      firstPaxOn: "",
      lastPaxOn: "",
      ...overrides,
    };
  }

  function resetAll() {
    setEditingId("");
    setLookupDate("");
    setLookupAirline("SY");
    setCurrentStatus("new");
    setForm(createInitialForm(user));
    setSpecials(createInitialSpecials());
    setGateCheck(createInitialGateCheck());
    setDelayAnnouncements(["", "", "", ""]);
    setActuals({});
    setStatusMessage("");
  }

  function handleStdChange(nextStd) {
    if (!canEdit) return;

    const currentStd = String(form.std || "").trim();
    const nextValue = String(nextStd || "").trim();

    if (currentStd === nextValue) return;

    const hasDependentData = hasChecklistDependentData(
      form,
      specials,
      gateCheck,
      delayAnnouncements,
      actuals
    );

    if (currentStd && hasDependentData) {
      const ok = window.confirm(
        "Changing STD will clear the form, continue?"
      );
      if (!ok) return;

      setForm((prev) =>
        resetDependentFieldsKeepingBase(prev, {
          std: nextValue,
        })
      );
      clearDependentSections();

      if (nextValue) {
        setTimeout(() => {
          flightRef.current?.focus();
        }, 0);
      }
      return;
    }

    setForm((prev) => ({
      ...prev,
      std: nextValue,
    }));

    if (nextValue) {
      setTimeout(() => {
        flightRef.current?.focus();
      }, 0);
    }
  }

  function updateField(field, value) {
    if (!canEdit) return;

    if (field === "airline") {
      setForm((prev) =>
        resetDependentFieldsKeepingBase(prev, {
          airline: value,
        })
      );
      clearDependentSections();
      return;
    }

    if (field === "date") {
      setForm((prev) =>
        resetDependentFieldsKeepingBase(prev, {
          date: value,
        })
      );
      clearDependentSections();
      return;
    }

    if (field === "std") {
      handleStdChange(value);
      return;
    }

    if (field !== "airline" && field !== "date" && field !== "std" && !stdUnlocked) {
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateActual(sectionIndex, taskIndex, value) {
    if (!canEdit || !stdUnlocked) return;
    const key = `${sectionIndex}-${taskIndex}`;
    setActuals((prev) => ({ ...prev, [key]: value }));
  }

  function handlePrintExportPdf() {
    const html = buildPrintableGateChecklistHtml({
      form,
      specials,
      gateCheck,
      delayAnnouncements,
      checklistSections,
      actuals,
      currentStatus,
      user,
    });

    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to export/print PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  }

  function buildPayload(nextStatus) {
    const weekStart = getWeekStart(form.date);
    const month = String(form.date || "").slice(0, 7);
    const otpDepartureMinutes = getOtpMinutes(form.std, form.pushTime);
    const isOtpDeparture =
      otpDepartureMinutes !== null ? otpDepartureMinutes <= 15 : null;

    return {
      airline: form.airline,
      flight: form.flight,
      date: form.date,
      weekStart,
      month,

      aircraft: form.aircraft || "",
      origin: form.origin || "",
      destination: form.destination || "",
      finalTotalPax: Number(form.finalTotalPax || 0),
      totalIbPax: Number(form.totalIbPax || 0),
      delayCode: form.delayCode || "",
      delay: form.delay || "No",
      delayTimeMinutes: Number(form.delayTimeMinutes || 0),
      controllable: form.controllable || "No",

      gateAgent: form.gateAgent || "",
      expeditor: form.expeditor || "",
      supervisor: form.supervisor || "",

      firstPaxOff: form.firstPaxOff || "",
      lastPaxOff: form.lastPaxOff || "",
      firstPaxOn: form.firstPaxOn || "",
      lastPaxOn: form.lastPaxOn || "",

      blockIn: form.blockIn || "",
      std: form.std || "",
      newStd: form.newStd || "",
      boardingDeadline: form.boardingDeadline || "",
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
      actuals: checklistSections.reduce((acc, section, sectionIndex) => {
        (section.tasks || []).forEach((task, taskIndex) => {
          const key = `${sectionIndex}-${taskIndex}`;
          const mappedField = getMappedTaskField(task);

          acc[key] = mappedField
            ? form[mappedField] || ""
            : actuals[key] || "";
        });

        return acc;
      }, {}),
      checklistSections,

      otpDepartureMinutes,
      isOtpDeparture,

      remarks: form.remarks || "",

      status: nextStatus,
      submittedBy: getVisibleUserName(user),
      submittedByUserId: user?.id || "",
      updatedAt: serverTimestamp(),
      updatedBy: getVisibleUserName(user),
    };
  }

  async function handleSaveDraft() {
    try {
      setSaving(true);
      setStatusMessage("");

      const payload = buildPayload("draft");

      if (editingId) {
        await updateDoc(doc(db, "gateChecklistReports", editingId), payload);
        setCurrentStatus("draft");
        setStatusMessage("Draft updated successfully.");
        return;
      }

      const ref = await addDoc(collection(db, "gateChecklistReports"), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      setEditingId(ref.id);
      setCurrentStatus("draft");
      setStatusMessage("Draft saved successfully.");
    } catch (error) {
      console.error("Error saving draft:", error);
      setStatusMessage("Could not save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitChecklist() {
    if (!form.airline || !form.flight || !form.date || !form.std) {
      setStatusMessage("Please complete airline, date, STD and flight.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      const payload = buildPayload("submitted");

      if (editingId) {
        await updateDoc(doc(db, "gateChecklistReports", editingId), {
          ...payload,
          submittedAt: serverTimestamp(),
          submittedByName: getVisibleUserName(user),
        });
        setCurrentStatus("submitted");
        setStatusMessage("Gate checklist submitted successfully.");
        return;
      }

      const ref = await addDoc(collection(db, "gateChecklistReports"), {
        ...payload,
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        submittedByName: getVisibleUserName(user),
      });

      setEditingId(ref.id);
      setCurrentStatus("submitted");
      setStatusMessage("Gate checklist submitted successfully.");
    } catch (error) {
      console.error("Error submitting gate checklist:", error);
      setStatusMessage("Could not submit gate checklist.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseFlight() {
    if (!editingId) {
      setStatusMessage("Save or submit the checklist first.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      await updateDoc(doc(db, "gateChecklistReports", editingId), {
        ...buildPayload("closed"),
        closedAt: serverTimestamp(),
        closedBy: getVisibleUserName(user),
      });

      setCurrentStatus("closed");
      setStatusMessage("Flight closed successfully.");
    } catch (error) {
      console.error("Error closing flight:", error);
      setStatusMessage("Could not close flight.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenChecklist() {
    if (!editingId) return;

    if (!isSupervisorOrManager) {
      setStatusMessage("Only supervisors or managers can reopen a checklist.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      await updateDoc(doc(db, "gateChecklistReports", editingId), {
        status: "draft",
        reopenedAt: serverTimestamp(),
        reopenedBy: getVisibleUserName(user),
        updatedAt: serverTimestamp(),
        updatedBy: getVisibleUserName(user),
      });

      setCurrentStatus("draft");
      setStatusMessage("Checklist reopened successfully.");
    } catch (error) {
      console.error("Error reopening checklist:", error);
      setStatusMessage("Could not reopen checklist.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadChecklist() {
    if (!lookupDate.trim() || !lookupAirline.trim()) {
      setStatusMessage("Select date and airline.");
      return;
    }

    try {
      setLoadingChecklist(true);
      setStatusMessage("");

      const q = query(
        collection(db, "gateChecklistReports"),
        where("date", "==", lookupDate.trim()),
        where("airline", "==", lookupAirline.trim())
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setStatusMessage("No checklist found for that date and airline.");
        return;
      }

      const docs = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .sort((a, b) => {
          const aTime =
            (a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0)).getTime();
          const bTime =
            (b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0)).getTime();
          return bTime - aTime;
        });

      const data = docs[0];

      setEditingId(data.id);
      setCurrentStatus(data.status === "closed" ? "closed" : "draft");

      setForm({
        airline: data.airline || "SY",
        flight: data.flight || "",
        date: data.date || "",
        aircraft: data.aircraft || "",
        origin: data.origin || "",
        destination: data.destination || "",
        finalTotalPax:
          data.finalTotalPax !== undefined && data.finalTotalPax !== null
            ? String(data.finalTotalPax)
            : "",
        totalIbPax:
          data.totalIbPax !== undefined && data.totalIbPax !== null
            ? String(data.totalIbPax)
            : "",
        delayCode: data.delayCode || "",
        delay: data.delay || "No",
        delayTimeMinutes:
          data.delayTimeMinutes !== undefined && data.delayTimeMinutes !== null
            ? String(data.delayTimeMinutes)
            : "",
        controllable: data.controllable || "No",
        blockIn: data.blockIn || "",
        std: data.std || data.etd || "",
        newStd: data.newStd || data.newEtd || "",
        boardingDeadline: data.boardingDeadline || "",
        actualDepartureTime: data.actualDepartureTime || "",
        actualArrivalTime: data.actualArrivalTime || "",
        gpuConnected: data.gpuConnected || "",
        gateAgent1Arrival: data.gateAgent1Arrival || "",
        gateAgent2Arrival: data.gateAgent2Arrival || "",
        brakeReleaseTime: data.brakeReleaseTime || "",
        pushTime: data.pushTime || "",
        checkedBags:
          data.checkedBags !== undefined && data.checkedBags !== null
            ? String(data.checkedBags)
            : "",
        notLoadedBags:
          data.notLoadedBags !== undefined && data.notLoadedBags !== null
            ? String(data.notLoadedBags)
            : "",
        remarks: data.remarks || "",
        gateAgent: data.gateAgent || getVisibleUserName(user),
        expeditor: data.expeditor || "",
        supervisor: data.supervisor || "",
        firstPaxOff: data.firstPaxOff || "",
        lastPaxOff: data.lastPaxOff || "",
        firstPaxOn: data.firstPaxOn || "",
        lastPaxOn: data.lastPaxOn || "",
      });

      setSpecials({
        ...createInitialSpecials(),
        ...(data.specials || {}),
      });

      setGateCheck({
        ...createInitialGateCheck(),
        ...(data.gateCheck || {}),
      });

      setDelayAnnouncements(
        Array.isArray(data.delayAnnouncements) && data.delayAnnouncements.length
          ? [...data.delayAnnouncements, "", "", "", ""].slice(0, 4)
          : ["", "", "", ""]
      );

      const loadedActuals = data.actuals || {};
      setActuals(loadedActuals);

      // Backward compatibility: if older reports saved duplicated checklist
      // answers only inside actuals, copy them into the main fields.
      const loadedSections = Array.isArray(data.checklistSections)
        ? data.checklistSections
        : buildChecklistByAirline(data.airline || "SY");

      const mappedBackfill = {};
      loadedSections.forEach((section, sectionIndex) => {
        (section.tasks || []).forEach((task, taskIndex) => {
          const mappedField = getMappedTaskField(task);
          const oldValue = loadedActuals[`${sectionIndex}-${taskIndex}`];

          if (
            mappedField &&
            oldValue &&
            !String(
              data[mappedField] ||
                (mappedField === "brakeReleaseTime"
                  ? data.brakeReleaseTime
                  : mappedField === "pushTime"
                  ? data.pushTime
                  : "")
            ).trim()
          ) {
            mappedBackfill[mappedField] = oldValue;
          }
        });
      });

      if (Object.keys(mappedBackfill).length) {
        setForm((prev) => ({
          ...prev,
          ...mappedBackfill,
        }));
      }

      setStatusMessage(
        data.status === "closed"
          ? "Checklist loaded, but it is closed."
          : "Checklist loaded and ready to continue."
      );
    } catch (error) {
      console.error("Error loading checklist:", error);
      setStatusMessage("Could not load checklist.");
    } finally {
      setLoadingChecklist(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 14 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        color: "#0f172a",
        width: "100%",
        maxWidth: 1280,
        minWidth: 0,
        margin: "0 auto",
        padding: isMobile ? "0 2px" : isTablet ? "0 4px" : 0,
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @page {
          size: portrait;
          margin: 0.2in;
        }

        @media print {
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * {
            visibility: hidden;
          }

          .print-only-area,
          .print-only-area * {
            visibility: visible;
          }

          .print-only-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: #fff;
          }

          .no-print {
            display: none !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border-radius: 10px !important;
          }

          .print-main-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-label {
            font-size: 10px !important;
            margin-bottom: 3px !important;
          }

          .print-input,
          .print-time,
          .print-select,
          .print-textarea {
            border: 1px solid #94a3b8 !important;
            background: #fff !important;
            color: #000 !important;
            padding: 6px 8px !important;
            font-size: 11px !important;
            min-height: 32px !important;
          }

          .print-textarea {
            min-height: 70px !important;
          }

          .print-grid-tight {
            gap: 8px !important;
          }

          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: 10px !important;
          }

          .print-table th,
          .print-table td {
            border: 1px solid #94a3b8 !important;
            padding: 6px 8px !important;
            vertical-align: top !important;
            font-size: 10px !important;
          }

          .print-table th {
            background: #f8fafc !important;
            font-weight: 900 !important;
          }

          .print-side-cards {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }

          .print-hide-header {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 16 : 20,
          padding: isMobile ? 12 : isTablet ? 16 : 20,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: isMobile ? 10 : 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            opacity: 0.85,
          }}
        >
          AEROSTATION HUB | GATE CHECKLIST
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: isMobile ? 22 : isTablet ? 24 : 28,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          Gate Checklist
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: isMobile ? 11 : isTablet ? 12 : 13,
            maxWidth: 900,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          AeroStation Hub operational gate checklist with 24-hour time selection, draft, submit,
          close flight, reopen, baggage counts, New STD, D-10/D-15, delay
          tracking, and pax flow.
        </p>
      </div>

      {statusMessage && (
        <PageCard className="no-print" style={{ padding: 14 }}>
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

      <PageCard className="no-print" style={{ padding: isMobile ? 10 : isTablet ? 12 : 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : isTablet
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(180px, 240px) minmax(180px, 240px) auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <FieldLabel>Fecha</FieldLabel>
            <TextInput
              type="date"
              value={lookupDate}
              onChange={(e) => setLookupDate(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>AerolÃ­nea</FieldLabel>
            <SelectInput
              value={lookupAirline}
              onChange={(e) => setLookupAirline(e.target.value)}
            >
              {AIRLINE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <ActionButton
            variant="secondary"
            onClick={handleLoadChecklist}
            disabled={loadingChecklist}
          >
            {loadingChecklist ? "Loading..." : "Load Checklist"}
          </ActionButton>

          <ActionButton variant="secondary" onClick={resetAll}>
            New Checklist
          </ActionButton>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={statusPillStyle("#edf7ff", "#cfe7fb", "#1769aa")}>
            Current ID: <b>{editingId || "New"}</b>
          </div>
          <div style={statusPillStyle("#f8fafc", "#cbd5e1", "#334155")}>
            Status: <b>{currentStatus}</b>
          </div>
          <div style={statusPillStyle("#f8fafc", "#cbd5e1", "#334155")}>
            Editable: <b>{canEdit ? "Yes" : "No"}</b>
          </div>
          <div
            style={statusPillStyle(
              stdUnlocked ? "#ecfdf5" : "#fff7ed",
              stdUnlocked ? "#a7f3d0" : "#fdba74",
              stdUnlocked ? "#166534" : "#9a3412"
            )}
          >
            Form: <b>{stdUnlocked ? "Unlocked" : "Locked until STD"}</b>
          </div>
        </div>
      </PageCard>

      <div className="print-only-area">
        <PageCard
          className="print-main-card"
          style={{ padding: isMobile ? 10 : isTablet ? 12 : 16 }}
        >
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr 1fr"
                  : "repeat(5, auto)",
                gap: 8,
                width: isMobile ? "100%" : "auto",
              }}
            >
              <ActionButton
                variant="primary"
                onClick={handlePrintExportPdf}
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                Print / Export PDF
              </ActionButton>

              <ActionButton
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saving || !canEdit}
                style={{ width: "100%" }}
              >
                {saving ? "Saving..." : "Save Draft"}
              </ActionButton>

              <ActionButton
                variant="success"
                onClick={handleSubmitChecklist}
                disabled={saving || !canSubmit}
                style={{ width: "100%" }}
              >
                {saving ? "Submitting..." : "Submit Checklist"}
              </ActionButton>

              {canClose && (
                <ActionButton
                  variant="warning"
                  onClick={handleCloseFlight}
                  disabled={saving || isClosed}
                  style={{ width: "100%" }}
                >
                  {saving ? "Closing..." : "Close Flight"}
                </ActionButton>
              )}

              {canReopen && (
                <ActionButton
                  variant="danger"
                  onClick={handleReopenChecklist}
                  disabled={saving}
                  style={{ width: "100%" }}
                >
                  {saving ? "Reopening..." : "Reopen Checklist"}
                </ActionButton>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: isMobile ? 22 : isTablet ? 25 : 30,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                }}
              >
                Gate Checklist
              </div>
            </div>

            <div
              className="print-grid-tight"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <FieldLabel className="print-label">Airline</FieldLabel>
                <SelectInput
                  value={form.airline}
                  disabled={!canEdit}
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
                <FieldLabel className="print-label">Date</FieldLabel>
                <TextInput
                  type="date"
                  value={form.date}
                  disabled={!canEdit}
                  onChange={(e) => updateField("date", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">STD</FieldLabel>
                <TimeInput
                  value={form.std}
                  disabled={!canEdit}
                  onChange={(e) => updateField("std", e.target.value)}
                  style={{
                    border: stdUnlocked ? "1px solid #cbd5e1" : "2px solid #f59e0b",
                  }}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Gate Agent</FieldLabel>
                <TextInput value={form.gateAgent} disabled />
              </div>

              <div>
                <FieldLabel className="print-label">Expeditor</FieldLabel>
                <TextInput
                  value={form.expeditor}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("expeditor", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Supervisor</FieldLabel>
                <TextInput
                  value={form.supervisor}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("supervisor", e.target.value)}
                />
              </div>
            </div>

            {!stdUnlocked && (
              <PageCard
                className="no-print"
                style={{
                  padding: 14,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#9a3412",
                  }}
                >
                  Enter Airline, Date and STD first. The rest of the checklist will unlock after STD is assigned.
                  Repeated timing items (First/Last Pax Off, First/Last Pax On, Brake Release and Push)
                  are synchronized automatically across the form.
                </div>
              </PageCard>
            )}

            <div
              style={{
                marginTop: 2,
                fontSize: 15,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Flight Information
            </div>

            <div
              style={{
                marginTop: 2,
                fontSize: 15,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Timing, Delay & Baggage
            </div>

            <div
              className="print-grid-tight"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <div>
                <FieldLabel className="print-label">Flight</FieldLabel>
                <TextInput
                  ref={flightRef}
                  value={form.flight}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("flight", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">A/C</FieldLabel>
                <TextInput
                  value={form.aircraft}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("aircraft", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Orig</FieldLabel>
                <TextInput
                  value={form.origin}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("origin", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Dest</FieldLabel>
                <TextInput
                  value={form.destination}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("destination", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Final Total Pax</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  value={form.finalTotalPax}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("finalTotalPax", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Total IB Pax</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  value={form.totalIbPax}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("totalIbPax", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Delay Code</FieldLabel>
                <TextInput
                  value={form.delayCode}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("delayCode", e.target.value)}
                />
              </div>
            </div>

            <div
              className="print-grid-tight"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <FieldLabel className="print-label">Delay</FieldLabel>
                <SelectInput
                  value={form.delay}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("delay", e.target.value)}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </SelectInput>
              </div>

              <div>
                <FieldLabel className="print-label">Delay Time (Minutes)</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  value={form.delayTimeMinutes}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("delayTimeMinutes", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Controllable</FieldLabel>
                <SelectInput
                  value={form.controllable}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("controllable", e.target.value)}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </SelectInput>
              </div>

              <div>
                <FieldLabel className="print-label">Block In</FieldLabel>
                <TimeInput
                  value={form.blockIn}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("blockIn", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">New STD</FieldLabel>
                <TimeInput value={form.newStd} disabled />
              </div>

              <div>
                <FieldLabel className="print-label">{form.airline === "SY" ? "D-10" : "D-15"}</FieldLabel>
                <TimeInput value={form.boardingDeadline} disabled />
              </div>

              <div>
                <FieldLabel className="print-label">Actual Departure Time</FieldLabel>
                <TimeInput
                  value={form.actualDepartureTime}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) =>
                    updateField("actualDepartureTime", e.target.value)
                  }
                />
              </div>

              <div>
                <FieldLabel className="print-label">Actual Arrival Time</FieldLabel>
                <TimeInput
                  value={form.actualArrivalTime}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("actualArrivalTime", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Gate Agent 1 Arrival</FieldLabel>
                <TimeInput
                  value={form.gateAgent1Arrival}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("gateAgent1Arrival", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Gate Agent 2 Arrival</FieldLabel>
                <TimeInput
                  value={form.gateAgent2Arrival}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("gateAgent2Arrival", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Checked Bags</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  disabled={!canEdit || !stdUnlocked}
                  value={form.checkedBags}
                  onChange={(e) => updateField("checkedBags", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">Not Loaded Bags</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  disabled={!canEdit || !stdUnlocked}
                  value={form.notLoadedBags}
                  onChange={(e) => updateField("notLoadedBags", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel className="print-label">GPU Connected Y or N</FieldLabel>
                <TextInput
                  value={form.gpuConnected}
                  disabled={!canEdit || !stdUnlocked}
                  onChange={(e) => updateField("gpuConnected", e.target.value)}
                />
              </div>
            </div>

            <div
              className="print-grid-tight"
              style={{
                display: "grid",
                gridTemplateColumns:
                  isMobile || isTablet
                    ? "1fr"
                    : "minmax(0, 1.7fr) minmax(250px, 0.8fr)",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <table
                  className="print-table"
                  style={{
                    width: "100%",
                    minWidth: isMobile ? 560 : isTablet ? 640 : 0,
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                    fontSize: isMobile ? 11 : 12,
                    opacity: stdUnlocked ? 1 : 0.65,
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
                          <div style={{ display: "grid", gap: 6 }}>
                            {section.tasks.map((task, taskIndex) => (
                              <div
                                key={`${section.time}-${taskIndex}`}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "12px 1fr",
                                  gap: 8,
                                  alignItems: "start",
                                }}
                              >
                                <div
                                  aria-hidden="true"
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: "#1769aa",
                                    marginTop: 7,
                                    flexShrink: 0,
                                  }}
                                />
                                <div>{task}</div>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td style={tableCellStyle}>
                          <div style={{ display: "grid", gap: 6 }}>
                            {section.tasks.map((task, taskIndex) => (
                              <TimeInput
                                key={`${sectionIndex}-${taskIndex}`}
                                disabled={!canEdit || !stdUnlocked}
                                value={getTaskActualValue(task, sectionIndex, taskIndex)}
                                onChange={(e) =>
                                  updateTaskActual(
                                    task,
                                    sectionIndex,
                                    taskIndex,
                                    e.target.value
                                  )
                                }
                                style={{
                                  padding: "6px 8px",
                                  minHeight: 34,
                                  fontSize: 11.5,
                                  background: getMappedTaskField(task)
                                    ? "#f0fdf4"
                                    : "#ffffff",
                                }}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                className="print-side-cards"
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : isTablet
                    ? "repeat(2, minmax(0, 1fr))"
                    : "1fr",
                  gap: 10,
                  opacity: stdUnlocked ? 1 : 0.65,
                }}
              >
                <PageCard style={{ padding: 11 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      marginBottom: 9,
                      textAlign: "center",
                    }}
                  >
                    Push / Departure
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <FieldLabel className="print-label">Brake Release Time</FieldLabel>
                      <TimeInput
                        value={form.brakeReleaseTime}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("brakeReleaseTime", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel className="print-label">Push Time</FieldLabel>
                      <TimeInput
                        value={form.pushTime}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("pushTime", e.target.value)}
                      />
                    </div>
                  </div>
                </PageCard>

                <PageCard style={{ padding: 11 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      marginBottom: 9,
                      textAlign: "center",
                    }}
                  >
                    Pax Flow
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div>
                      <FieldLabel className="print-label">First Pax Off</FieldLabel>
                      <TimeInput
                        value={form.firstPaxOff}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("firstPaxOff", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel className="print-label">Last Pax Off</FieldLabel>
                      <TimeInput
                        value={form.lastPaxOff}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("lastPaxOff", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel className="print-label">First Pax On</FieldLabel>
                      <TimeInput
                        value={form.firstPaxOn}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("firstPaxOn", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel className="print-label">Last Pax On</FieldLabel>
                      <TimeInput
                        value={form.lastPaxOn}
                        disabled={!canEdit || !stdUnlocked}
                        onChange={(e) => updateField("lastPaxOn", e.target.value)}
                      />
                    </div>
                  </div>
                </PageCard>

                <PageCard style={{ padding: 11 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      marginBottom: 9,
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
                          disabled={!canEdit || !stdUnlocked}
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

                <PageCard style={{ padding: 11 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      marginBottom: 9,
                      textAlign: "center",
                    }}
                  >
                    Delay Announcements Made (24H)
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {delayAnnouncements.map((item, index) => (
                      <TimeInput
                        key={index}
                        disabled={!canEdit || !stdUnlocked}
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

                <PageCard style={{ padding: 11 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      marginBottom: 9,
                      textAlign: "center",
                    }}
                  >
                    Gate Check
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={gateCheckRowStyle}>
                      <div style={gateCheckLabelStyle}>BAGS</div>
                      <TextInput
                        disabled={!canEdit || !stdUnlocked}
                        value={gateCheck.bags}
                        onChange={(e) =>
                          setGateCheck((prev) => ({ ...prev, bags: e.target.value }))
                        }
                      />
                    </div>

                    <div style={gateCheckRowStyle}>
                      <div style={gateCheckLabelStyle}>STROLLERS/CARSEATS</div>
                      <TextInput
                        disabled={!canEdit || !stdUnlocked}
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
                        disabled={!canEdit || !stdUnlocked}
                        value={gateCheck.wchrs}
                        onChange={(e) =>
                          setGateCheck((prev) => ({ ...prev, wchrs: e.target.value }))
                        }
                      />
                    </div>

                    <div style={gateCheckRowStyle}>
                      <div style={gateCheckLabelStyle}>OTHER</div>
                      <TextInput
                        disabled={!canEdit || !stdUnlocked}
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

            <PageCard style={{ padding: isMobile ? 10 : 12, opacity: stdUnlocked ? 1 : 0.65 }}>
              <FieldLabel className="print-label">Notes</FieldLabel>
              <TextArea
                value={form.remarks}
                disabled={!canEdit || !stdUnlocked}
                onChange={(e) => updateField("remarks", e.target.value)}
                placeholder="Add notes here..."
                style={{ minHeight: isMobile ? 80 : 95 }}
              />
            </PageCard>
          </div>
        </PageCard>
      </div>

      <div
        className="no-print"
        style={{
          textAlign: "center",
          padding: "4px 0 12px",
          fontSize: 11,
          color: "#94a3b8",
          fontWeight: 700,
        }}
      >
        AeroStation Hub | Operational Management Platform
      </div>
    </div>
  );
}

const tableHeadStyle = {
  border: "1px solid #94a3b8",
  background: "#f8fafc",
  padding: "8px 9px",
  fontSize: 11.5,
  textAlign: "left",
  fontWeight: 900,
};

const tableCellStyle = {
  border: "1px solid #94a3b8",
  padding: "8px 9px",
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

function statusPillStyle(bg, border, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    color,
    fontWeight: 700,
  };
}
