import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
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

function TimeInput(props) {
  return (
    <input
      type="time"
      step="60"
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

const YES_NO_OPTIONS = [
  { value: "", label: "Select" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
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

function calculateNewEtdAndDeadline(airline, blockIn, etd) {
  const blockInMinutes = toMinutesFromTime(blockIn);
  const etdMinutes = toMinutesFromTime(etd);
  const rules = getAirlineTurnRules(airline);

  if (etdMinutes === null) {
    return {
      newEtd: "",
      boardingDeadline: "",
    };
  }

  let referenceEtdMinutes = etdMinutes;

  if (blockInMinutes !== null) {
    let adjustedEtdMinutes = etdMinutes;

    if (adjustedEtdMinutes < blockInMinutes) {
      adjustedEtdMinutes += 24 * 60;
    }

    const currentTurnMinutes = adjustedEtdMinutes - blockInMinutes;

    if (currentTurnMinutes < rules.minTurnMinutes) {
      referenceEtdMinutes = blockInMinutes + rules.minTurnMinutes;

      return {
        newEtd: minutesToTime(referenceEtdMinutes),
        boardingDeadline: minutesToTime(
          referenceEtdMinutes - rules.boardingOffsetMinutes
        ),
      };
    }
  }

  return {
    newEtd: "",
    boardingDeadline: minutesToTime(
      referenceEtdMinutes - rules.boardingOffsetMinutes
    ),
  };
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
    agents: "",
    delay: "",
    delayTimeMinutes: "",
    delayCode: "",
    controllable: "",
    blockIn: "",
    etd: "",
    newEtd: "",
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
  };
}

export default function GateChecklistPage() {
  const { user } = useUser();

  const isSupervisorOrManager =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [saving, setSaving] = useState(false);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [lookupId, setLookupId] = useState("");
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

  const canEdit = !isClosed && (!isExisting || currentStatus === "draft" || true);
  const canReopen = isExisting && (isSubmitted || isClosed) && isSupervisorOrManager;
  const canClose = isExisting;
  const canSubmit = !!form.airline && !!form.flight && !!form.date && canEdit;

  useEffect(() => {
    const { newEtd, boardingDeadline } = calculateNewEtdAndDeadline(
      form.airline,
      form.blockIn,
      form.etd
    );

    setForm((prev) => {
      if (
        prev.newEtd === newEtd &&
        prev.boardingDeadline === boardingDeadline
      ) {
        return prev;
      }

      return {
        ...prev,
        newEtd,
        boardingDeadline,
      };
    });
  }, [form.airline, form.blockIn, form.etd]);

  function resetAll() {
    setEditingId("");
    setLookupId("");
    setCurrentStatus("new");
    setForm(createInitialForm(user));
    setSpecials(createInitialSpecials());
    setGateCheck(createInitialGateCheck());
    setDelayAnnouncements(["", "", "", ""]);
    setActuals({});
    setStatusMessage("");
  }

  function updateField(field, value) {
    if (!canEdit) return;
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateActual(sectionIndex, taskIndex, value) {
    if (!canEdit) return;
    const key = `${sectionIndex}-${taskIndex}`;
    setActuals((prev) => ({ ...prev, [key]: value }));
  }

  function handlePrint() {
    window.print();
  }

  function buildPayload(nextStatus) {
    const weekStart = getWeekStart(form.date);
    const month = String(form.date || "").slice(0, 7);
    const otpDepartureMinutes = getOtpMinutes(form.etd, form.pushTime);
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
      agents: form.agents || "",

      delay: form.delay || "",
      delayTimeMinutes: Number(form.delayTimeMinutes || 0),
      delayCode: form.delayCode || "",
      controllable: form.controllable || "",

      gateAgent: form.gateAgent || "",
      expeditor: form.expeditor || "",
      supervisor: form.supervisor || "",

      blockIn: form.blockIn || "",
      etd: form.etd || "",
      newEtd: form.newEtd || "",
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
      actuals,
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
      setLookupId(ref.id);
      setCurrentStatus("draft");
      setStatusMessage(`Draft saved successfully. ID: ${ref.id}`);
    } catch (error) {
      console.error("Error saving draft:", error);
      setStatusMessage("Could not save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitChecklist() {
    if (!form.airline || !form.flight || !form.date) {
      setStatusMessage("Please complete airline, flight and date.");
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
      setLookupId(ref.id);
      setCurrentStatus("submitted");
      setStatusMessage(`Gate checklist submitted successfully. ID: ${ref.id}`);
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
    if (!lookupId.trim()) {
      setStatusMessage("Enter a checklist ID.");
      return;
    }

    try {
      setLoadingChecklist(true);
      setStatusMessage("");

      const ref = doc(db, "gateChecklistReports", lookupId.trim());
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setStatusMessage("Checklist not found.");
        return;
      }

      const data = snap.data();

      setEditingId(snap.id);
      setCurrentStatus(data.status || "draft");

      setForm({
        airline: data.airline || "SY",
        flight: data.flight || "",
        date: data.date || "",
        aircraft: data.aircraft || "",
        origin: data.origin || "",
        destination: data.destination || "",
        agents: data.agents || "",
        delay: data.delay || "",
        delayTimeMinutes:
          data.delayTimeMinutes !== undefined && data.delayTimeMinutes !== null
            ? String(data.delayTimeMinutes)
            : "",
        delayCode: data.delayCode || "",
        controllable: data.controllable || "",
        blockIn: data.blockIn || "",
        etd: data.etd || "",
        newEtd: data.newEtd || "",
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
        gateAgent: data.gateAgent || "",
        expeditor: data.expeditor || "",
        supervisor: data.supervisor || "",
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

      setActuals(data.actuals || {});
      setStatusMessage(`Checklist ${snap.id} loaded successfully.`);
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
          Printable gate checklist with 24-hour time selection, draft, submit,
          close flight, reopen, baggage counts, New ETD, D-10/D-15, delay tracking,
          and OTP tracking.
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

      <PageCard className="no-print" style={{ padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 320px) auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <FieldLabel>Load Checklist by ID</FieldLabel>
            <TextInput
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Paste checklist ID"
            />
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
        </div>
      </PageCard>

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
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={saving || !canEdit}
            >
              {saving ? "Saving..." : "Save Draft"}
            </ActionButton>

            <ActionButton
              variant="success"
              onClick={handleSubmitChecklist}
              disabled={saving || !canSubmit}
            >
              {saving ? "Submitting..." : "Submit Checklist"}
            </ActionButton>

            {canClose && (
              <ActionButton
                variant="warning"
                onClick={handleCloseFlight}
                disabled={saving || isClosed}
              >
                {saving ? "Closing..." : "Close Flight"}
              </ActionButton>
            )}

            {canReopen && (
              <ActionButton
                variant="danger"
                onClick={handleReopenChecklist}
                disabled={saving}
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
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: "-0.03em",
              }}
            >
              Gate Checklist
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
              <FieldLabel>Gate Agent</FieldLabel>
              <TextInput value={form.gateAgent} disabled />
            </div>

            <div>
              <FieldLabel>Expeditor</FieldLabel>
              <TextInput
                value={form.expeditor}
                disabled={!canEdit}
                onChange={(e) => updateField("expeditor", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Supervisor</FieldLabel>
              <TextInput
                value={form.supervisor}
                disabled={!canEdit}
                onChange={(e) => updateField("supervisor", e.target.value)}
              />
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
                disabled={!canEdit}
                onChange={(e) => updateField("flight", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={form.date}
                disabled={!canEdit}
                onChange={(e) => updateField("date", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>A/C</FieldLabel>
              <TextInput
                value={form.aircraft}
                disabled={!canEdit}
                onChange={(e) => updateField("aircraft", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Orig</FieldLabel>
              <TextInput
                value={form.origin}
                disabled={!canEdit}
                onChange={(e) => updateField("origin", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Dest</FieldLabel>
              <TextInput
                value={form.destination}
                disabled={!canEdit}
                onChange={(e) => updateField("destination", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Agent(s)</FieldLabel>
              <TextInput
                value={form.agents}
                disabled={!canEdit}
                onChange={(e) => updateField("agents", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Delay Code</FieldLabel>
              <TextInput
                value={form.delayCode}
                disabled={!canEdit}
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
              <FieldLabel>Block In</FieldLabel>
              <TimeInput
                value={form.blockIn}
                disabled={!canEdit}
                onChange={(e) => updateField("blockIn", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>ETD</FieldLabel>
              <TimeInput
                value={form.etd}
                disabled={!canEdit}
                onChange={(e) => updateField("etd", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>New ETD</FieldLabel>
              <TimeInput value={form.newEtd} disabled />
            </div>

            <div>
              <FieldLabel>{form.airline === "SY" ? "D-10" : "D-15"}</FieldLabel>
              <TimeInput value={form.boardingDeadline} disabled />
            </div>

            <div>
              <FieldLabel>Actual Departure Time</FieldLabel>
              <TimeInput
                value={form.actualDepartureTime}
                disabled={!canEdit}
                onChange={(e) =>
                  updateField("actualDepartureTime", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Actual Arrival Time</FieldLabel>
              <TimeInput
                value={form.actualArrivalTime}
                disabled={!canEdit}
                onChange={(e) => updateField("actualArrivalTime", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Brake Release Time</FieldLabel>
              <TimeInput
                value={form.brakeReleaseTime}
                disabled={!canEdit}
                onChange={(e) => updateField("brakeReleaseTime", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Push Time</FieldLabel>
              <TimeInput
                value={form.pushTime}
                disabled={!canEdit}
                onChange={(e) => updateField("pushTime", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Gate Agent 1 Arrival</FieldLabel>
              <TimeInput
                value={form.gateAgent1Arrival}
                disabled={!canEdit}
                onChange={(e) => updateField("gateAgent1Arrival", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Gate Agent 2 Arrival</FieldLabel>
              <TimeInput
                value={form.gateAgent2Arrival}
                disabled={!canEdit}
                onChange={(e) => updateField("gateAgent2Arrival", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Delay</FieldLabel>
              <SelectInput
                value={form.delay}
                disabled={!canEdit}
                onChange={(e) => updateField("delay", e.target.value)}
              >
                {YES_NO_OPTIONS.map((item) => (
                  <option key={item.value || "blank-delay"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Delay Time (Minutes)</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={form.delayTimeMinutes}
                disabled={!canEdit}
                onChange={(e) => updateField("delayTimeMinutes", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Controllable</FieldLabel>
              <SelectInput
                value={form.controllable}
                disabled={!canEdit}
                onChange={(e) => updateField("controllable", e.target.value)}
              >
                {YES_NO_OPTIONS.map((item) => (
                  <option key={item.value || "blank-control"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Checked Bags</FieldLabel>
              <TextInput
                type="number"
                min="0"
                disabled={!canEdit}
                value={form.checkedBags}
                onChange={(e) => updateField("checkedBags", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Not Loaded Bags</FieldLabel>
              <TextInput
                type="number"
                min="0"
                disabled={!canEdit}
                value={form.notLoadedBags}
                onChange={(e) => updateField("notLoadedBags", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>GPU Connected Y or N</FieldLabel>
              <TextInput
                value={form.gpuConnected}
                disabled={!canEdit}
                onChange={(e) => updateField("gpuConnected", e.target.value)}
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
                            <TimeInput
                              key={`${sectionIndex}-${taskIndex}`}
                              disabled={!canEdit}
                              value={actuals[`${sectionIndex}-${taskIndex}`] || ""}
                              onChange={(e) =>
                                updateActual(sectionIndex, taskIndex, e.target.value)
                              }
                              style={{ padding: "8px 10px", fontSize: 12 }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                        disabled={!canEdit}
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
                  Delay Announcements Made (24H)
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {delayAnnouncements.map((item, index) => (
                    <TimeInput
                      key={index}
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                      value={gateCheck.bags}
                      onChange={(e) =>
                        setGateCheck((prev) => ({ ...prev, bags: e.target.value }))
                      }
                    />
                  </div>

                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>STROLLERS/CARSEATS</div>
                    <TextInput
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                      value={gateCheck.wchrs}
                      onChange={(e) =>
                        setGateCheck((prev) => ({ ...prev, wchrs: e.target.value }))
                      }
                    />
                  </div>

                  <div style={gateCheckRowStyle}>
                    <div style={gateCheckLabelStyle}>OTHER</div>
                    <TextInput
                      disabled={!canEdit}
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
              disabled={!canEdit}
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
