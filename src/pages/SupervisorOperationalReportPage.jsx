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

    if (field.type === "yesno") {
      result[field.key] = "";
      return;
    }

    result[field.key] = "";
  });

  return result;
}

function shouldRequireAttentionFromResponses(responses) {
  return Object.entries(responses || {}).some(([key, value]) => {
    const k = String(key || "").toLowerCase();

    if (
      k.includes("operation completed without issues") ||
      k.includes("operation completed without issue") ||
      k.includes("completed without issues")
    ) {
      return String(value || "").trim().toLowerCase() === "no";
    }

    return false;
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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

function normalizeFieldKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const DEFAULT_FIELDS = [
  {
    key: "operation_completed_without_issues",
    label: "Operation Completed Without Issues",
    type: "yesno",
    required: true,
    options: ["Yes", "No"],
  },
  {
    key: "staffing_ok",
    label: "Staffing OK",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
  },
  {
    key: "equipment_ok",
    label: "Equipment OK",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
  },
  {
    key: "safety_concerns",
    label: "Safety Concerns",
    type: "textarea",
    required: false,
  },
  {
    key: "additional_comments",
    label: "Additional Comments",
    type: "textarea",
    required: false,
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
  const [dynamicFields, setDynamicFields] = useState(DEFAULT_FIELDS);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    airline: "",
    reportDate: "",
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
    responses: buildInitialResponses(DEFAULT_FIELDS),
  });

  useEffect(() => {
    async function loadBuilderConfig() {
      try {
        const snap = await getDocs(collection(db, "operational_report_form_fields"));

        if (snap.empty) {
          setDynamicFields(DEFAULT_FIELDS);
          setForm((prev) => ({
            ...prev,
            responses: buildInitialResponses(DEFAULT_FIELDS),
          }));
          return;
        }

        const fields = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => item.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
          .map((item) => ({
            key: item.key || normalizeFieldKey(item.label),
            label: item.label || "Unnamed Field",
            type: item.type || "text",
            required: Boolean(item.required),
            options: Array.isArray(item.options) ? item.options : [],
          }));

        const finalFields = fields.length ? fields : DEFAULT_FIELDS;

        setDynamicFields(finalFields);
        setForm((prev) => ({
          ...prev,
          responses: buildInitialResponses(finalFields),
        }));
      } catch (err) {
        console.error("Error loading operational report builder:", err);
        setDynamicFields(DEFAULT_FIELDS);
        setForm((prev) => ({
          ...prev,
          responses: buildInitialResponses(DEFAULT_FIELDS),
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

  const visibleAirlineLabel = useMemo(() => {
    const found = AIRLINE_OPTIONS.find((a) => a.value === form.airline);
    return found?.label || form.airline || "—";
  }, [form.airline]);

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
        reportDate: form.reportDate,
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
        reportDate: "",
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
              Submit the operational report from your profile, include delays,
              issues, and dynamic form responses for manager follow-up.
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
            Complete the main operational report information first.
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
            <FieldLabel>Report Date</FieldLabel>
            <TextInput
              type="date"
              value={form.reportDate}
              onChange={(e) => handleFormChange("reportDate", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <TextInput
              value={form.shift}
              onChange={(e) => handleFormChange("shift", e.target.value)}
              placeholder="AM / PM / MID / 05:00-13:30"
            />
          </div>

          <div>
            <FieldLabel>Flights Handled</FieldLabel>
            <TextInput
              value={form.flightsHandled}
              onChange={(e) => handleFormChange("flightsHandled", e.target.value)}
              placeholder="Example: 4"
            />
          </div>

          <div>
            <FieldLabel>Supervisor Reporting</FieldLabel>
            <TextInput
              value={form.supervisorReporting}
              onChange={(e) =>
                handleFormChange("supervisorReporting", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Supervisor Position</FieldLabel>
            <TextInput
              value={form.supervisorPosition}
              onChange={(e) =>
                handleFormChange("supervisorPosition", e.target.value)
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
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            If there was a delayed flight, complete all related fields.
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
            Dynamic Operational Questions
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            These questions update automatically from the Operational Report Builder.
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
              Attention alert: this report will be flagged because the response indicates the operation was not completed without issues.
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

        {(form.airline || form.reportDate) && (
          <div
            style={{
              marginTop: 16,
              borderRadius: 16,
              padding: "14px 16px",
              background: "#f8fbff",
              border: "1px solid #dbeafe",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Submission Preview
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#0f172a",
                lineHeight: 1.7,
                fontWeight: 600,
              }}
            >
              Airline: {visibleAirlineLabel}
              <br />
              Date: {form.reportDate || "—"}
              <br />
              Delayed Flight: {form.delayedFlight ? "Yes" : "No"}
              <br />
              Needs Attention: {finalNeedsAttention ? "Yes" : "No"}
            </div>
          </div>
        )}
      </PageCard>
    </div>
  );
}
