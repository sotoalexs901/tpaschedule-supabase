import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";

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
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
        fontSize: 11,
        fontWeight: 800,
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 92,
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
      boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
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
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
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
  const { isMobile, isTablet } = useViewport();

  const today = useMemo(() => new Date(), []);
  const defaultDate = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const defaultTime = `${String(today.getHours()).padStart(2, "0")}:${String(
    today.getMinutes()
  ).padStart(2, "0")}`;

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const initialForm = () => ({
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

  const [form, setForm] = useState(initialForm);

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
    setForm(initialForm());
  };

  const failedInspectionItems = useMemo(() => {
    return INSPECTION_ITEMS.map((label, index) => ({
      itemNumber: index + 1,
      label,
      result: form[`item_${index + 1}`] || "yes",
    })).filter((item) => item.result === "no");
  }, [form]);

  const hasAnyNo = failedInspectionItems.length > 0;
  const requiresManagementAttention =
    form.anyInopWchr === "yes" || hasAnyNo;

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

    const totalInspected = Number(form.totalWchrsInspected);
    const totalAvailable = Number(form.totalWchrsAvailable);
    const totalInventory = String(form.totalInventory || "").trim()
      ? Number(form.totalInventory)
      : null;

    if (
      !Number.isFinite(totalInspected) ||
      totalInspected <= 0
    ) {
      setStatusMessage("Please enter a valid total WCHRs inspected.");
      return;
    }

    if (
      !Number.isFinite(totalAvailable) ||
      totalAvailable < 0
    ) {
      setStatusMessage("Please enter a valid total WCHRs available.");
      return;
    }

    if (
      totalInventory !== null &&
      (!Number.isFinite(totalInventory) || totalInventory < 0)
    ) {
      setStatusMessage("Please enter a valid total inventory.");
      return;
    }

    if (
      totalInventory !== null &&
      totalAvailable > totalInventory
    ) {
      setStatusMessage(
        "Available WCHRs cannot be greater than total inventory."
      );
      return;
    }

    if (requiresManagementAttention) {
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

    if (!String(form.inspectorSignature || "").trim()) {
      setStatusMessage("Please add the inspector signature.");
      return;
    }

    try {
      setSaving(true);

      const inspectionResults = INSPECTION_ITEMS.map((label, index) => ({
        itemNumber: index + 1,
        label,
        result: form[`item_${index + 1}`] || "yes",
      }));

      const unitNumbersList = String(form.unitNumbersInspected || "")
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);

      const reportRef = await addDoc(collection(db, "wchr_poi_reports"), {
        inspectorName: String(form.inspectorName || "").trim(),
        date: form.date,
        time: form.time,
        location: form.location,
        totalInventory: form.totalInventory || "",
        unitNumbersInspected: form.unitNumbersInspected,
        unitNumbersList,
        totalWchrsInspected: form.totalWchrsInspected,
        totalWchrsAvailable: form.totalWchrsAvailable,
        inspectionResults,
        failedInspectionCount: failedInspectionItems.length,
        failedInspectionItems,
        anyInopWchr: form.anyInopWchr,
        requiresManagementAttention,
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

      try {
        await createOperationalAlert({
          alertType: requiresManagementAttention
            ? "WCHR_POI_INOP_REPORTED"
            : "WCHR_POI_SUBMITTED",
          category: "WCHR_POI",
          severity: requiresManagementAttention ? "HIGH" : "LOW",
          priority: requiresManagementAttention ? "URGENT" : "LOW",
          title: requiresManagementAttention
            ? "WCHR POI: INOP / Failed Inspection"
            : "WCHR POI Submitted",
          message: requiresManagementAttention
            ? `WCHR POI requires management review. ${failedInspectionItems.length} inspection item(s) were marked NO. Out of service unit(s): ${String(
                form.outOfServiceUnits || "Not listed"
              ).trim()}. Location: ${form.location}. Inspector: ${String(
                form.inspectorName || getVisibleName(user)
              ).trim()}.`
            : `WCHR POI was submitted with no failed inspection items. ${form.totalWchrsInspected} wheelchair(s) inspected at ${form.location} by ${String(
                form.inspectorName || getVisibleName(user)
              ).trim()}.`,
          source: "SupervisorWchrPoiPage",
          sourceId: reportRef.id,
          department: "WCHR",
          reportDate: form.date,
          targetRoles: ["station_manager", "duty_manager"],
          createdByUserId: user?.id || "",
          createdByUsername: user?.username || "",
          createdByName: getVisibleName(user),
          createdByRole: user?.role || "",
          metadata: {
            wchrPoiReportId: reportRef.id,
            location: form.location,
            totalInventory: form.totalInventory || "",
            totalWchrsInspected: form.totalWchrsInspected,
            totalWchrsAvailable: form.totalWchrsAvailable,
            unitNumbersList,
            anyInopWchr: form.anyInopWchr,
            outOfServiceUnits: form.outOfServiceUnits || "",
            damageDetails: form.damageDetails || "",
            failedInspectionCount: failedInspectionItems.length,
            failedInspectionItems,
            inspectorName: String(form.inspectorName || "").trim(),
          },
        });
      } catch (alertErr) {
        console.error("WCHR POI alert error:", alertErr);
      }

      setStatusMessage("WCHR POI submitted successfully.");
      handleReset();
    } catch (err) {
      console.error("Error saving WCHR POI:", err);
      setStatusMessage("Could not submit WCHR POI.");
    } finally {
      setSaving(false);
    }
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(auto-fit, minmax(240px, 1fr))",
    gap: isMobile ? 10 : 14,
  };

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 18 : 22,
          padding: isMobile
            ? "14px"
            : isTablet
            ? "16px 18px"
            : "18px 20px",
          color: "#fff",
          boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.07)",
            top: -92,
            right: -28,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            gap: isMobile ? 10 : 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: isMobile ? 5 : 7,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: isMobile ? 34 : 40,
                  height: isMobile ? 34 : 40,
                  borderRadius: 10,
                  objectFit: "contain",
                  background: "#ffffff",
                  flexShrink: 0,
                }}
              />

              <p
                style={{
                  margin: 0,
                  fontSize: isMobile ? 9 : 10,
                  textTransform: "uppercase",
                  letterSpacing: isMobile ? "0.12em" : "0.16em",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} WCHR
              </p>
            </div>

            <h1
              style={{
                margin: "0 0 4px",
                fontSize: isMobile ? 20 : isTablet ? 23 : 25,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              Wheelchair Pre-Operating Inspection
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 900,
                fontSize: isMobile ? 11.5 : 12.5,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Complete the inspection at the beginning of the shift. Any failed
              item or INOP wheelchair creates an urgent management alert.
            </p>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 9.5 : 10.5,
                color: "rgba(255,255,255,0.72)",
                fontWeight: 700,
              }}
            >
              {APP_SUBTITLE}
            </p>
          </div>

          <div
            style={{
              width: isMobile ? "100%" : "auto",
              display: "flex",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <ActionButton
              onClick={() => navigate("/dashboard")}
              variant="secondary"
              disabled={saving}
            >
              {"\u2190"} Back to Dashboard
            </ActionButton>
          </div>
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
            padding: 16,
          }}
          onClick={() => setStatusMessage("")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 500,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 20,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                background: isErrorStatus ? "#fff1f2" : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: isErrorStatus ? "#9f1239" : "#065f46",
                }}
              >
                {isErrorStatus ? "Action Required" : "Inspection Saved"}
              </div>
            </div>

            <div
              style={{
                padding: "18px",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 18px 18px",
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
                  borderRadius: 12,
                  padding: "10px 20px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Inspection Header
        </h2>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Inspector Name</FieldLabel>
            <TextInput
              value={form.inspectorName}
              onChange={(e) =>
                handleChange("inspectorName", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) =>
                handleChange("date", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Time</FieldLabel>
            <TextInput
              type="time"
              value={form.time}
              onChange={(e) =>
                handleChange("time", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <SelectInput
              value={form.location}
              onChange={(e) =>
                handleChange("location", e.target.value)
              }
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
              min="0"
              step="1"
              inputMode="numeric"
              value={form.totalInventory}
              onChange={(e) =>
                handleChange("totalInventory", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Total WCHRs Inspected</FieldLabel>
            <TextInput
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
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
              min="0"
              step="1"
              inputMode="numeric"
              value={form.totalWchrsAvailable}
              onChange={(e) =>
                handleChange("totalWchrsAvailable", e.target.value)
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Unit Numbers Inspected</FieldLabel>
          <TextArea
            value={form.unitNumbersInspected}
            onChange={(e) =>
              handleChange("unitNumbersInspected", e.target.value)
            }
            placeholder="Example: EAR15, EAR30, EAR34 or one per line"
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Inspection Items
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            Mark YES if operable or NO if inoperable.
          </p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {INSPECTION_ITEMS.map((item, index) => {
            const field = `item_${index + 1}`;
            const failed = form[field] === "no";

            return (
              <div
                key={field}
                style={{
                  border: failed
                    ? "1px solid #fda4af"
                    : "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: isMobile ? 12 : 14,
                  background: failed ? "#fff1f2" : "#f8fbff",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: isMobile ? 12.5 : 13.5,
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.45,
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
                      gap: 7,
                      fontWeight: 800,
                      fontSize: 12.5,
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
                      gap: 7,
                      fontWeight: 800,
                      fontSize: 12.5,
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

        {hasAnyNo && (
          <div
            style={{
              marginTop: 12,
              padding: "11px 13px",
              borderRadius: 12,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            {failedInspectionItems.length} inspection item(s) marked NO. This
            submission will generate an urgent management alert.
          </div>
        )}
      </PageCard>

      <PageCard
        style={{
          padding: isMobile ? 14 : 20,
          border: requiresManagementAttention
            ? "1px solid #fda4af"
            : "1px solid #e2e8f0",
        }}
      >
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Out of Service / Damage Reporting
        </h2>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Any INOP WCHR?</FieldLabel>
            <SelectInput
              value={form.anyInopWchr}
              onChange={(e) =>
                handleChange("anyInopWchr", e.target.value)
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </SelectInput>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Out of Service Unit(s)</FieldLabel>
          <TextArea
            value={form.outOfServiceUnits}
            onChange={(e) =>
              handleChange("outOfServiceUnits", e.target.value)
            }
            placeholder="List unit number(s) that are out of service"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Damage Details</FieldLabel>
          <TextArea
            value={form.damageDetails}
            onChange={(e) =>
              handleChange("damageDetails", e.target.value)
            }
            placeholder="Describe the issue or damage found"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Photo Notes</FieldLabel>
          <TextArea
            value={form.photoNotes}
            onChange={(e) =>
              handleChange("photoNotes", e.target.value)
            }
            placeholder="Describe photo(s), if applicable"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Inspector Signature</FieldLabel>
          <TextInput
            value={form.inspectorSignature}
            onChange={(e) =>
              handleChange("inspectorSignature", e.target.value)
            }
            placeholder="Type full name as signature"
            style={{
              fontFamily: "cursive",
              fontSize: 17,
              fontWeight: 700,
            }}
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit WCHR POI"}
          </ActionButton>

          <ActionButton
            onClick={handleReset}
            variant="secondary"
            disabled={saving}
          >
            Clear
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
