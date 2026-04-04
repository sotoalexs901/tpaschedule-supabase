import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

const INSPECTION_ITEMS = [
  "Check wheelchair frame and structure for cracks, bends, or visible damage.",
  "Inspect wheelchair for sharp edges, loose parts, or missing components.",
  "Check condition of rear wheels and front caster wheels. Ensure they rotate freely and are not damaged.",
  "Verify that wheel locks/brakes are operational and securely hold the wheelchair in place.",
  "Check that footrests are secure, properly attached, and move freely.",
  "Ensure armrests are secure and in good condition.",
  "Inspect seat and backrest for tears, excessive wear, or instability.",
  "Verify that seatbelt (if installed) is present and functioning properly.",
  "Ensure handles used to push the wheelchair are secure and not loose.",
  "Check that the wheelchair rolls smoothly and turns properly.",
  "Verify the wheelchair is clean.",
  "Ensure wheelchair identification number/tag is present and visible.",
];

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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 110,
        fontFamily: "inherit",
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
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.employeeName ||
    user?.username ||
    "User"
  );
}

function buildInitialInspectionState() {
  const result = {};
  INSPECTION_ITEMS.forEach((_, index) => {
    result[`item_${index + 1}`] = "yes";
  });
  return result;
}

export default function SupervisorWchrPoiPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const defaultDate = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const defaultTime = `${String(today.getHours()).padStart(2, "0")}:${String(
    today.getMinutes()
  ).padStart(2, "0")}`;

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    inspectorName: getVisibleName(user),
    date: defaultDate,
    time: defaultTime,
    location: "",
    totalInventory: "",
    unitNumbersInspected: "",
    totalWchrsInspected: "",
    totalWchrsAvailable: "",
    anyInopWchr: "no",
    outOfServiceUnits: "",
    damageDetails: "",
    photoNotes: "",
    inspectorSignature: "",
    ...buildInitialInspectionState(),
  });

  const isErrorStatus =
    statusMessage.toLowerCase().includes("could not") ||
    statusMessage.toLowerCase().includes("please");

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReset = () => {
    setForm({
      inspectorName: getVisibleName(user),
      date: defaultDate,
      time: defaultTime,
      location: "",
      totalInventory: "",
      unitNumbersInspected: "",
      totalWchrsInspected: "",
      totalWchrsAvailable: "",
      anyInopWchr: "no",
      outOfServiceUnits: "",
      damageDetails: "",
      photoNotes: "",
      inspectorSignature: "",
      ...buildInitialInspectionState(),
    });
  };

  const hasAnyNo = INSPECTION_ITEMS.some((_, index) => {
    return form[`item_${index + 1}`] === "no";
  });

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!String(form.inspectorName || "").trim()) {
      setStatusMessage("Please enter inspector name.");
      return;
    }

    if (!String(form.date || "").trim()) {
      setStatusMessage("Please select the date.");
      return;
    }

    if (!String(form.time || "").trim()) {
      setStatusMessage("Please select the time.");
      return;
    }

    if (!String(form.location || "").trim()) {
      setStatusMessage("Please select or enter the location.");
      return;
    }

    if (!String(form.unitNumbersInspected || "").trim()) {
      setStatusMessage("Please enter the unit numbers inspected.");
      return;
    }

    if (!String(form.totalWchrsInspected || "").trim()) {
      setStatusMessage("Please enter total WCHRs inspected.");
      return;
    }

    if (!String(form.totalWchrsAvailable || "").trim()) {
      setStatusMessage("Please enter total WCHRs available.");
      return;
    }

    if (form.anyInopWchr === "yes" || hasAnyNo) {
      if (!String(form.outOfServiceUnits || "").trim()) {
        setStatusMessage(
          "Please list the out of service wheelchair unit number(s)."
        );
        return;
      }

      if (!String(form.damageDetails || "").trim()) {
        setStatusMessage("Please enter the damage details.");
        return;
      }
    }

    try {
      setSaving(true);

      const inspectionResults = INSPECTION_ITEMS.map((label, index) => ({
        itemNumber: index + 1,
        label,
        result: form[`item_${index + 1}`] || "yes",
      }));

      await addDoc(collection(db, "wchr_poi_reports"), {
        inspectorName: form.inspectorName,
        date: form.date,
        time: form.time,
        location: form.location,
        totalInventory: form.totalInventory || "",
        unitNumbersInspected: form.unitNumbersInspected,
        unitNumbersList: String(form.unitNumbersInspected || "")
          .split(/[\n,]+/)
          .map((x) => x.trim())
          .filter(Boolean),
        totalWchrsInspected: form.totalWchrsInspected,
        totalWchrsAvailable: form.totalWchrsAvailable,
        inspectionResults,
        anyInopWchr: form.anyInopWchr,
        outOfServiceUnits: form.outOfServiceUnits || "",
        damageDetails: form.damageDetails || "",
        photoNotes: form.photoNotes || "",
        inspectorSignature: form.inspectorSignature || "",
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByRole: user?.role || "",
        archived: false,
        status: "submitted",
        createdAt: serverTimestamp(),
      });

      setStatusMessage("WCHR POI submitted successfully.");
      handleReset();
    } catch (err) {
      console.error("Error saving WCHR POI:", err);
      setStatusMessage("Could not submit WCHR POI.");
    } finally {
      setSaving(false);
    }
  };

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
          TPA OPS · WCHR
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
          Wheelchairs Pre Operating Inspection (POI)
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 900,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Complete the wheelchair inspection at the beginning of the shift. If any
          item is marked NO, place a DO NOT OPERATE tag and notify Maintenance or
          a Supervisor/Manager immediately.
        </p>
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
                {isErrorStatus ? "Action Required" : "Inspection Saved"}
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

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Inspection Header
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Inspector Name</FieldLabel>
            <TextInput
              value={form.inspectorName}
              onChange={(e) => handleChange("inspectorName", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Time</FieldLabel>
            <TextInput
              type="time"
              value={form.time}
              onChange={(e) => handleChange("time", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <SelectInput
              value={form.location}
              onChange={(e) => handleChange("location", e.target.value)}
            >
              <option value="">Select location</option>
              <option value="Gate">Gate</option>
              <option value="Ticket Counter">Ticket Counter</option>
              <option value="Baggage Claim">Baggage Claim</option>
              <option value="Curbside">Curbside</option>
              <option value="Other">Other</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Total Inventory</FieldLabel>
            <TextInput
              type="number"
              value={form.totalInventory}
              onChange={(e) => handleChange("totalInventory", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Total WCHRs Inspected</FieldLabel>
            <TextInput
              type="number"
              value={form.totalWchrsInspected}
              onChange={(e) =>
                handleChange("totalWchrsInspected", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Total WCHRs Available</FieldLabel>
            <TextInput
              type="number"
              value={form.totalWchrsAvailable}
              onChange={(e) =>
                handleChange("totalWchrsAvailable", e.target.value)
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Unit Numbers Inspected</FieldLabel>
          <TextArea
            value={form.unitNumbersInspected}
            onChange={(e) => handleChange("unitNumbersInspected", e.target.value)}
            placeholder="Example: EAR15, EAR30, EAR34 or one per line"
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Inspection Items
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Mark YES if operable or NO if inoperable.
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {INSPECTION_ITEMS.map((item, index) => {
            const field = `item_${index + 1}`;

            return (
              <div
                key={field}
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: 18,
                  padding: 16,
                  background: "#f8fbff",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.5,
                  }}
                >
                  {index + 1}. {item}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 18,
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 700,
                      color: "#065f46",
                    }}
                  >
                    <input
                      type="radio"
                      name={field}
                      checked={form[field] === "yes"}
                      onChange={() => handleChange(field, "yes")}
                    />
                    Yes
                  </label>

                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 700,
                      color: "#9f1239",
                    }}
                  >
                    <input
                      type="radio"
                      name={field}
                      checked={form[field] === "no"}
                      onChange={() => handleChange(field, "no")}
                    />
                    No
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Out of Service / Damage Reporting
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Any INOP WCHR?</FieldLabel>
            <SelectInput
              value={form.anyInopWchr}
              onChange={(e) => handleChange("anyInopWchr", e.target.value)}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </SelectInput>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Out of Service Unit(s)</FieldLabel>
          <TextArea
            value={form.outOfServiceUnits}
            onChange={(e) => handleChange("outOfServiceUnits", e.target.value)}
            placeholder="List unit number(s) that are out of service"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Damage Details</FieldLabel>
          <TextArea
            value={form.damageDetails}
            onChange={(e) => handleChange("damageDetails", e.target.value)}
            placeholder="Describe the issue or damage found"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Photo Notes</FieldLabel>
          <TextArea
            value={form.photoNotes}
            onChange={(e) => handleChange("photoNotes", e.target.value)}
            placeholder="Describe uploaded photo(s) or note that a photo was attached"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Inspector Signature</FieldLabel>
          <TextInput
            value={form.inspectorSignature}
            onChange={(e) => handleChange("inspectorSignature", e.target.value)}
            placeholder="Type full name as signature"
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit WCHR POI"}
          </ActionButton>

          <ActionButton onClick={handleReset} variant="secondary">
            Clear
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
            Back to Dashboard
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
