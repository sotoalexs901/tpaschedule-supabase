import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

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

function DynamicField({ field, value, onChange }) {
  const commonProps = {
    value: value ?? "",
    onChange: (e) => onChange(field.key, e.target.value),
    placeholder: field.placeholder || "",
  };

  if (field.type === "textarea") {
    return <TextArea {...commonProps} />;
  }

  if (field.type === "select") {
    return (
      <SelectInput {...commonProps}>
        <option value="">Select</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectInput>
    );
  }

  if (field.type === "number") {
    return <TextInput {...commonProps} type="number" />;
  }

  if (field.type === "date") {
    return <TextInput {...commonProps} type="date" />;
  }

  if (field.type === "time") {
    return <TextInput {...commonProps} type="time" />;
  }

  return <TextInput {...commonProps} type="text" />;
}

export default function SupervisorOperationalReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    airline: "",
    reportDate: "",
    shift: "",
    supervisorReporting: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "",
  });

  const [responses, setResponses] = useState({});

  useEffect(() => {
    async function loadFields() {
      try {
        const q = query(
          collection(db, "operational_report_form_config"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => item.active !== false);

        setFields(rows);
      } catch (err) {
        console.error("Error loading operational report fields:", err);
        setStatusMessage("Could not load report form.");
      } finally {
        setLoadingFields(false);
      }
    }

    if (canAccess) {
      loadFields();
    } else {
      setLoadingFields(false);
    }
  }, [canAccess]);

  const groupedFields = useMemo(() => {
    const map = {};
    fields.forEach((field) => {
      const section = field.section || "Other";
      if (!map[section]) map[section] = [];
      map[section].push(field);
    });
    return map;
  }, [fields]);

  if (!canAccess) {
    return (
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
            TPA OPS · Operational Report
          </p>
          <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Access denied
          </h1>
          <p style={{ margin: 0, maxWidth: 700, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            You do not have permission to access Operational Reports.
          </p>
        </div>
      </div>
    );
  }

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleResponseChange = (key, value) => {
    setResponses((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!form.airline) {
      setStatusMessage("Please select the reporting airline.");
      return;
    }

    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return;
    }

    const missingRequired = fields.find(
      (field) => field.required && !String(responses[field.key] || "").trim()
    );

    if (missingRequired) {
      setStatusMessage(`Please complete required field: ${missingRequired.label}`);
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "operational_reports"), {
        airline: normalizeAirlineName(form.airline),
        reportDate: form.reportDate,
        shift: form.shift || "",
        supervisorReporting: form.supervisorReporting || getVisibleName(user),
        supervisorPosition:
          form.supervisorPosition || user?.position || getDefaultPosition(user?.role),
        notes: form.notes || "",
        responses,
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
        status: "submitted",
      });

      setStatusMessage("Operational report submitted successfully.");

      setForm((prev) => ({
        ...prev,
        airline: "",
        reportDate: "",
        shift: "",
        notes: "",
      }));
      setResponses({});
    } catch (err) {
      console.error("Error saving operational report:", err);
      setStatusMessage("Could not submit operational report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
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
            <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
              TPA OPS · Operational Report
            </p>

            <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
              Submit Operational Report
            </h1>

            <p style={{ margin: 0, maxWidth: 760, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
              Header is fixed. The rest of the form updates automatically from the builder configuration.
            </p>
          </div>

          <ActionButton type="button" variant="secondary" onClick={() => navigate("/dashboard")}>
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Report Header
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Complete the general information before answering the report questions.
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
            <FieldLabel>Supervisor Reporting</FieldLabel>
            <TextInput
              value={form.supervisorReporting}
              onChange={(e) => handleFormChange("supervisorReporting", e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Header Notes</FieldLabel>
          <TextArea
            value={form.notes}
            onChange={(e) => handleFormChange("notes", e.target.value)}
            placeholder="Optional general notes"
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Dynamic Report Questions
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            These questions are loaded from the Operational Report Builder.
          </p>
        </div>

        {loadingFields ? (
          <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
            Loading report questions...
          </div>
        ) : fields.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
            No active questions found. Please create them in Operational Report Builder.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {Object.keys(groupedFields).map((section) => (
              <div
                key={section}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    padding: "14px 16px",
                    background: "#f8fbff",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#1769aa",
                  }}
                >
                  {section}
                </div>

                <div style={{ padding: 16, display: "grid", gap: 14 }}>
                  {groupedFields[section].map((field) => (
                    <div key={field.id}>
                      <FieldLabel>
                        {field.label}
                        {field.required ? " *" : ""}
                      </FieldLabel>

                      <DynamicField
                        field={field}
                        value={responses[field.key] || ""}
                        onChange={handleResponseChange}
                      />

                      {field.helpText ? (
                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: 12,
                            color: "#64748b",
                            lineHeight: 1.6,
                          }}
                        >
                          {field.helpText}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionButton onClick={handleSubmit} variant="primary" disabled={saving}>
            {saving ? "Submitting..." : "Submit Operational Report"}
          </ActionButton>

          <ActionButton onClick={() => navigate("/dashboard")} variant="secondary">
            Cancel
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
