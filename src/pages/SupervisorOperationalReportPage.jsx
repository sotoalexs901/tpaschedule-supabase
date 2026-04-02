import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

function normalizeAirlineName(value) {
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
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function buildInitialResponses(fields) {
  const result = {};

  (fields || []).forEach((field) => {
    if (!field?.key) return;

    if (field.type === "checkbox-group") {
      result[field.key] = [];
      return;
    }

    result[field.key] = "";
  });

  return result;
}

function shouldRequireAttentionFromResponses(responses) {
  const operationStatus = String(responses?.operation_status || "").toLowerCase();

  if (
    operationStatus.includes("not completed") ||
    operationStatus.includes("remarks")
  ) {
    return true;
  }

  return false;
}

function mergeBaseFieldsWithBuilder(baseFields, builderFields) {
  const normalizedBuilder = (builderFields || []).map((item) => ({
    id: item.id,
    key: item.key,
    label: item.label,
    type: item.type || "text",
    required: Boolean(item.required),
    options: Array.isArray(item.options) ? item.options : [],
    active: item.active !== false,
    order: Number(item.order || 0),
  }));

  const builderMap = {};
  normalizedBuilder.forEach((field) => {
    if (!field.key) return;
    builderMap[field.key] = field;
  });

  const mergedBase = baseFields
    .map((base, index) => {
      const override = builderMap[base.key];
      const merged = override
        ? {
            ...base,
            ...override,
            options:
              override.type === "yesno"
                ? ["Yes", "No"]
                : override.options?.length
                ? override.options
                : base.options || [],
          }
        : {
            ...base,
            order: Number(base.order || index + 1),
            active: true,
          };

      return merged;
    })
    .filter((field) => field.active !== false);

  const baseKeys = new Set(baseFields.map((field) => field.key));

  const extraFields = normalizedBuilder
    .filter((field) => field.active !== false && field.key && !baseKeys.has(field.key))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  return [...mergedBase, ...extraFields];
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
        background: "#ffffff",
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
        background: "#ffffff",
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
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 100,
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

const BASE_FIELDS = [
  {
    key: "operation_status",
    label: "Operation Status",
    type: "select",
    required: true,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operation not completed as planned",
    ],
    active: true,
    order: 1,
  },
  {
    key: "general_comments",
    label: "General Comments",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 2,
  },
  {
    key: "issue_types",
    label: "Issue Types (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: [
      "N/A",
      "Delays",
      "Staffing",
      "Baggage",
      "Equipment",
      "Customer Service",
      "Operational",
      "Safety",
      "Other",
    ],
    active: true,
    order: 3,
  },
  {
    key: "issue_details",
    label: "Issue Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 4,
  },
  {
    key: "action_taken",
    label: "Action Taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 5,
  },
  {
    key: "issue_status",
    label: "Status",
    type: "select",
    required: false,
    options: ["N/A", "Resolved", "Pending", "Escalated"],
    active: true,
    order: 6,
  },
  {
    key: "oh_bags_total_quantity",
    label: "OH Bags Total Quantity",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 7,
  },
  {
    key: "oh_bags_affected_flights",
    label: "OH Bags Affected Flights",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 8,
  },
  {
    key: "oh_bags_details",
    label: "OH Bags Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 9,
  },
  {
    key: "oh_bags_follow_up_actions",
    label: "OH Bags Follow-up Actions",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 10,
  },
  {
    key: "pending_item_1",
    label: "Pending Item 1",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 11,
  },
  {
    key: "pending_description",
    label: "Pending Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
  },
  {
    key: "pending_responsible",
    label: "Pending Responsible",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 13,
  },
  {
    key: "pending_target_date",
    label: "Pending Target Date",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 14,
  },
  {
    key: "exception_type",
    label: "Exception Type (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["N/A", "Operational", "Staffing", "Safety", "Baggage", "Other"],
    active: true,
    order: 15,
  },
  {
    key: "exception_description",
    label: "Exception Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 16,
  },
  {
    key: "exception_reason",
    label: "Exception Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 17,
  },
  {
    key: "exception_reported_to",
    label: "Reported To",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 18,
  },
  {
    key: "staffing_status",
    label: "Staffing Status (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["Full staffing", "Short staffed", "Overtime needed", "Call out", "Other"],
    active: true,
    order: 19,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 20,
  },
  {
    key: "employees_breaks",
    label: "Employees Breaks",
    type: "select",
    required: false,
    options: [
      "All agents have taken their scheduled break",
      "Not all agents have taken their scheduled break",
    ],
    active: true,
    order: 21,
  },
  {
    key: "employees_no_break_taken",
    label: "Name of Employees / No Break taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 22,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 23,
  },
];

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SY" },
  { value: "WestJet", label: "WestJet" },
  { value: "WL Invicta", label: "WL Invicta" },
  { value: "AV", label: "AV" },
  { value: "EA", label: "EA" },
  { value: "WCHR", label: "WCHR" },
  { value: "CABIN", label: "Cabin Service" },
  { value: "AA-BSO", label: "AA-BSO" },
  { value: "OTHER", label: "Other" },
];

export default function SupervisorOperationalReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [loadingBuilder, setLoadingBuilder] = useState(true);
  const [dynamicFields, setDynamicFields] = useState(BASE_FIELDS);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    airline: "",
    flightNumber: "",
    reportDate: "",
    department: "",
    shift: "",
    flightsHandled: "",
    supervisorReporting: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "",
    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",
    needsAttention: false,
    responses: buildInitialResponses(BASE_FIELDS),
  });

  useEffect(() => {
    async function loadBuilderConfig() {
      try {
        const snap = await getDocs(collection(db, "operational_report_form_fields"));

        const builderRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const finalFields = mergeBaseFieldsWithBuilder(BASE_FIELDS, builderRows);

        setDynamicFields(finalFields);

        setForm((prev) => {
          const currentResponses = prev.responses || {};
          const nextResponses = buildInitialResponses(finalFields);

          finalFields.forEach((field) => {
            if (currentResponses[field.key] !== undefined) {
              nextResponses[field.key] = currentResponses[field.key];
            }
          });

          return {
            ...prev,
            responses: nextResponses,
          };
        });
      } catch (err) {
        console.error("Error loading operational report builder:", err);
        setDynamicFields(BASE_FIELDS);
        setForm((prev) => ({
          ...prev,
          responses: buildInitialResponses(BASE_FIELDS),
        }));
      } finally {
        setLoadingBuilder(false);
      }
    }

    if (canAccess) {
      loadBuilderConfig();
    } else {
      setLoadingBuilder(false);
    }
  }, [canAccess]);

  const computedNeedsAttention = useMemo(() => {
    return shouldRequireAttentionFromResponses(form.responses);
  }, [form.responses]);

  const finalNeedsAttention = useMemo(() => {
    return Boolean(form.needsAttention || computedNeedsAttention);
  }, [form.needsAttention, computedNeedsAttention]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleResponseChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  const handleCheckboxGroupChange = (key, option, checked) => {
    setForm((prev) => {
      const current = Array.isArray(prev.responses?.[key]) ? prev.responses[key] : [];
      const next = checked
        ? [...current, option]
        : current.filter((item) => item !== option);

      return {
        ...prev,
        responses: {
          ...(prev.responses || {}),
          [key]: next,
        },
      };
    });
  };

  const validateRequiredFields = () => {
    if (!form.airline) {
      setStatusMessage("Please select the reporting airline.");
      return false;
    }

    if (!String(form.flightNumber || "").trim()) {
      setStatusMessage("Please enter the flight number.");
      return false;
    }

    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return false;
    }

    for (const field of dynamicFields) {
      if (!field.required) continue;

      const value = form.responses?.[field.key];

      if (field.type === "checkbox-group") {
        if (!Array.isArray(value) || value.length === 0) {
          setStatusMessage(`Please complete the required field: ${field.label}.`);
          return false;
        }
        continue;
      }

      if (String(value ?? "").trim() === "") {
        setStatusMessage(`Please complete the required field: ${field.label}.`);
        return false;
      }
    }

    if (form.delayedFlight) {
      if (!String(form.delayedTimeMinutes || "").trim()) {
        setStatusMessage("Please enter the delayed time in minutes.");
        return false;
      }

      if (!String(form.delayedReason || "").trim()) {
        setStatusMessage("Please enter the delayed reason.");
        return false;
      }

      if (!String(form.delayedCodeReported || "").trim()) {
        setStatusMessage("Please enter the delayed code reported to the airline.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!validateRequiredFields()) return;

    try {
      setSaving(true);

      const payload = {
        airline: normalizeAirlineName(form.airline),
        flightNumber: String(form.flightNumber || "").trim(),
        reportDate: form.reportDate,
        department: String(form.department || "").trim(),
        shift: String(form.shift || "").trim(),
        flightsHandled: String(form.flightsHandled || "").trim(),
        supervisorReporting:
          String(form.supervisorReporting || "").trim() || getVisibleName(user),
        supervisorPosition:
          String(form.supervisorPosition || "").trim() ||
          user?.position ||
          getDefaultPosition(user?.role),
        notes: String(form.notes || "").trim(),
        delayedFlight: Boolean(form.delayedFlight),
        delayedTimeMinutes: form.delayedFlight
          ? Number(form.delayedTimeMinutes || 0)
          : 0,
        delayedReason: form.delayedFlight
          ? String(form.delayedReason || "").trim()
          : "",
        delayedCodeReported: form.delayedFlight
          ? String(form.delayedCodeReported || "").trim()
          : "",
        needsAttention: finalNeedsAttention,
        responses: form.responses || {},
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
        status: "submitted",
      };

      await addDoc(collection(db, "operational_reports"), payload);

      setStatusMessage("Operational report submitted successfully.");

      setForm({
        airline: "",
        flightNumber: "",
        reportDate: "",
        department: "",
        shift: "",
        flightsHandled: "",
        supervisorReporting: getVisibleName(user),
        supervisorPosition: user?.position || getDefaultPosition(user?.role),
        notes: "",
        delayedFlight: false,
        delayedTimeMinutes: "",
        delayedReason: "",
        delayedCodeReported: "",
        needsAttention: false,
        responses: buildInitialResponses(dynamicFields),
      });
    } catch (err) {
      console.error("Error saving operational report:", err);
      setStatusMessage("Could not submit operational report.");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
            TPA OPS · Operational Reports
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
            Access denied
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            You do not have permission to submit operational reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
              TPA OPS · Operational Reports
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
              Submit Operational Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Submit the operational report from your profile, including delays,
              issues, OH bags, pending items, staffing, and final remarks.
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

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Report Header
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Complete the main report information first.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Reporting Airline</FieldLabel>
            <SelectInput
              value={form.airline}
              onChange={(e) => handleFormChange("airline", e.target.value)}
            >
              <option value="">Select airline</option>
              {AIRLINE_OPTIONS.map((airline) => (
                <option key={airline.value} value={airline.value}>
                  {airline.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Flight Number</FieldLabel>
            <TextInput
              value={form.flightNumber}
              onChange={(e) => handleFormChange("flightNumber", e.target.value)}
              placeholder="Example: 1234"
            />
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.reportDate}
              onChange={(e) => handleFormChange("reportDate", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={form.department}
              onChange={(e) => handleFormChange("department", e.target.value)}
              placeholder="Ramp / TC / BSO / WCHR / Cabin"
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <TextInput
              value={form.shift}
              onChange={(e) => handleFormChange("shift", e.target.value)}
              placeholder="AM / PM / MID"
            />
          </div>

          <div>
            <FieldLabel>Flights Handled</FieldLabel>
            <TextInput
              value={form.flightsHandled}
              onChange={(e) => handleFormChange("flightsHandled", e.target.value)}
              placeholder="Example: 4"
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Only Apply for BSO and Cabin Service
            </div>
          </div>

          <div>
            <FieldLabel>Supervisor (Name)</FieldLabel>
            <TextInput
              value={form.supervisorReporting}
              onChange={(e) =>
                handleFormChange("supervisorReporting", e.target.value)
              }
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Delay Information
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
            <FieldLabel>Delayed Flight</FieldLabel>
            <SelectInput
              value={form.delayedFlight ? "Yes" : "No"}
              onChange={(e) =>
                handleFormChange("delayedFlight", e.target.value === "Yes")
              }
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </SelectInput>
          </div>

          {form.delayedFlight && (
            <>
              <div>
                <FieldLabel>Delayed Time (minutes)</FieldLabel>
                <TextInput
                  type="number"
                  value={form.delayedTimeMinutes}
                  onChange={(e) =>
                    handleFormChange("delayedTimeMinutes", e.target.value)
                  }
                  placeholder="Example: 7"
                />
              </div>

              <div>
                <FieldLabel>Delayed Code Reported to the Airline</FieldLabel>
                <TextInput
                  value={form.delayedCodeReported}
                  onChange={(e) =>
                    handleFormChange("delayedCodeReported", e.target.value)
                  }
                  placeholder="Example: MX / WX / OPS"
                />
              </div>
            </>
          )}
        </div>

        {form.delayedFlight && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>Delayed Reason</FieldLabel>
            <TextArea
              value={form.delayedReason}
              onChange={(e) => handleFormChange("delayedReason", e.target.value)}
              placeholder="Explain the delayed reason"
            />
          </div>
        )}

        {form.delayedFlight && Number(form.delayedTimeMinutes || 0) > 4 && (
          <div
            style={{
              marginTop: 14,
              borderRadius: 16,
              padding: "14px 16px",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            Alert: this delay exceeds 4 minutes and will trigger manager follow-up.
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Operational Questions
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Base questions are always included. The builder can edit them, deactivate them, or add new ones.
          </p>
        </div>

        {loadingBuilder ? (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            Loading form fields...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {dynamicFields.map((field) => {
              const value = form.responses?.[field.key];

              if (field.type === "textarea") {
                return (
                  <div key={field.key}>
                    <FieldLabel>
                      {field.label} {field.required ? "*" : ""}
                    </FieldLabel>
                    <TextArea
                      value={String(value || "")}
                      onChange={(e) =>
                        handleResponseChange(field.key, e.target.value)
                      }
                    />
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key}>
                    <FieldLabel>
                      {field.label} {field.required ? "*" : ""}
                    </FieldLabel>
                    <SelectInput
                      value={String(value || "")}
                      onChange={(e) =>
                        handleResponseChange(field.key, e.target.value)
                      }
                    >
                      <option value="">Select option</option>
                      {(field.options || []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                );
              }

              if (field.type === "yesno") {
                return (
                  <div key={field.key}>
                    <FieldLabel>
                      {field.label} {field.required ? "*" : ""}
                    </FieldLabel>
                    <SelectInput
                      value={String(value || "")}
                      onChange={(e) =>
                        handleResponseChange(field.key, e.target.value)
                      }
                    >
                      <option value="">Select option</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </SelectInput>
                  </div>
                );
              }

              if (field.type === "checkbox-group") {
                const selected = Array.isArray(value) ? value : [];

                return (
                  <div key={field.key}>
                    <FieldLabel>
                      {field.label} {field.required ? "*" : ""}
                    </FieldLabel>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        borderRadius: 16,
                        padding: 14,
                      }}
                    >
                      {(field.options || []).map((option) => (
                        <label
                          key={option}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            color: "#0f172a",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(option)}
                            onChange={(e) =>
                              handleCheckboxGroupChange(
                                field.key,
                                option,
                                e.target.checked
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>
                  <TextInput
                    value={String(value || "")}
                    onChange={(e) =>
                      handleResponseChange(field.key, e.target.value)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Notes and Attention
          </h2>
        </div>

        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={form.notes}
            onChange={(e) => handleFormChange("notes", e.target.value)}
            placeholder="Additional operational notes"
          />
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            <input
              type="checkbox"
              checked={form.needsAttention}
              onChange={(e) => handleFormChange("needsAttention", e.target.checked)}
            />
            Mark report as Needs Attention
          </label>

          {computedNeedsAttention && (
            <div
              style={{
                borderRadius: 16,
                padding: "14px 16px",
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              Attention alert: this report will be flagged because the selected operation status indicates issues or incomplete operation.
            </div>
          )}
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit Operational Report"}
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
            Cancel
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
