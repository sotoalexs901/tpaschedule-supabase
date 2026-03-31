import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "checkbox_group",
  "number",
  "date",
  "time",
];

const DEFAULT_SECTIONS = [
  "Overall Operation Status",
  "Operational Issues",
  "OH Bags",
  "Pending Items",
  "Exceptions",
  "Staffing",
  "Final Remarks / Recommendations",
  "Other",
];

const STANDARD_TEMPLATE = [
  {
    key: "operationStatus",
    label: "Operation status",
    type: "select",
    section: "Overall Operation Status",
    required: true,
    active: true,
    order: 1,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operational delay",
      "Operational irregularity",
    ],
    placeholder: "",
    helpText: "Select the overall status of the shift.",
  },
  {
    key: "generalComments",
    label: "General comments",
    type: "textarea",
    section: "Overall Operation Status",
    required: false,
    active: true,
    order: 2,
    options: [],
    placeholder: "General comments about the operation",
    helpText: "",
  },
  {
    key: "delayedFlight",
    label: "Delayed Flight",
    type: "select",
    section: "Operational Issues",
    required: true,
    active: true,
    order: 3,
    options: ["No", "Yes"],
    placeholder: "",
    helpText: "Select Yes if the operation had a delayed flight.",
  },
  {
    key: "delayedTimeMinutes",
    label: "Delayed Time (minutes)",
    type: "number",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 4,
    options: [],
    placeholder: "Example: 12",
    helpText: "Complete only if Delayed Flight = Yes.",
  },
  {
    key: "delayedReason",
    label: "Delayed Reason",
    type: "textarea",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 5,
    options: [],
    placeholder: "Explain reason for the delay",
    helpText: "Complete only if Delayed Flight = Yes.",
  },
  {
    key: "delayedCodeReported",
    label: "Delayed Code Reported to the Airline",
    type: "text",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 6,
    options: [],
    placeholder: "Example: 93 / MX / OPS / WX",
    helpText: "Complete only if Delayed Flight = Yes.",
  },
  {
    key: "issueTypes",
    label: "Issue types",
    type: "checkbox_group",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 7,
    options: [
      "N/A",
      "Delays",
      "Baggage",
      "Staffing",
      "Customer service",
      "Gate change",
      "Late inbound",
      "Operational coordination",
      "Equipment",
      "Other",
    ],
    placeholder: "",
    helpText: "Select all that apply.",
  },
  {
    key: "issueDetails",
    label: "Issue details",
    type: "textarea",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 8,
    options: [],
    placeholder: "Describe the issue",
    helpText: "",
  },
  {
    key: "actionTaken",
    label: "Action taken",
    type: "textarea",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 9,
    options: [],
    placeholder: "Explain actions taken",
    helpText: "",
  },
  {
    key: "issueStatus",
    label: "Status",
    type: "select",
    section: "Operational Issues",
    required: false,
    active: true,
    order: 10,
    options: ["N/A", "Resolved", "Pending", "Monitoring", "Escalated"],
    placeholder: "",
    helpText: "",
  },
  {
    key: "ohBagTotalQty",
    label: "Total quantity",
    type: "number",
    section: "OH Bags",
    required: false,
    active: true,
    order: 11,
    options: [],
    placeholder: "0",
    helpText: "Total OH / mishandled bags.",
  },
  {
    key: "ohAffectedFlights",
    label: "Affected flights",
    type: "text",
    section: "OH Bags",
    required: false,
    active: true,
    order: 12,
    options: [],
    placeholder: "Example: CLT, DFW, MIA",
    helpText: "Separate flights with commas if needed.",
  },
  {
    key: "ohBagDetails",
    label: "Details",
    type: "textarea",
    section: "OH Bags",
    required: false,
    active: true,
    order: 13,
    options: [],
    placeholder: "Explain the OH bag situation",
    helpText: "",
  },
  {
    key: "ohFollowUpActions",
    label: "Follow-up actions",
    type: "textarea",
    section: "OH Bags",
    required: false,
    active: true,
    order: 14,
    options: [],
    placeholder: "What follow-up actions were taken?",
    helpText: "",
  },
  {
    key: "pendingItemDescription",
    label: "Pending item / description",
    type: "textarea",
    section: "Pending Items",
    required: false,
    active: true,
    order: 15,
    options: [],
    placeholder: "Describe pending item",
    helpText: "",
  },
  {
    key: "pendingItemResponsible",
    label: "Responsible",
    type: "text",
    section: "Pending Items",
    required: false,
    active: true,
    order: 16,
    options: [],
    placeholder: "Who is responsible?",
    helpText: "",
  },
  {
    key: "pendingItemTargetDate",
    label: "Target date",
    type: "date",
    section: "Pending Items",
    required: false,
    active: true,
    order: 17,
    options: [],
    placeholder: "",
    helpText: "",
  },
  {
    key: "exceptionTypes",
    label: "Exception type",
    type: "checkbox_group",
    section: "Exceptions",
    required: false,
    active: true,
    order: 18,
    options: [
      "N/A",
      "Operational",
      "Safety",
      "Security",
      "Customer service",
      "Staffing",
      "Delay",
      "Baggage",
      "Other",
    ],
    placeholder: "",
    helpText: "Select all that apply.",
  },
  {
    key: "exceptionDescription",
    label: "Description",
    type: "textarea",
    section: "Exceptions",
    required: false,
    active: true,
    order: 19,
    options: [],
    placeholder: "Describe the exception",
    helpText: "",
  },
  {
    key: "exceptionReason",
    label: "Reason",
    type: "textarea",
    section: "Exceptions",
    required: false,
    active: true,
    order: 20,
    options: [],
    placeholder: "Explain the reason",
    helpText: "",
  },
  {
    key: "exceptionReportedTo",
    label: "Reported to",
    type: "text",
    section: "Exceptions",
    required: false,
    active: true,
    order: 21,
    options: [],
    placeholder: "Who was notified?",
    helpText: "",
  },
  {
    key: "staffingStatus",
    label: "Staffing status",
    type: "checkbox_group",
    section: "Staffing",
    required: false,
    active: true,
    order: 22,
    options: [
      "Full staffing",
      "Short staffed",
      "Overtime required",
      "Call out",
      "Coverage adjustment",
    ],
    placeholder: "",
    helpText: "Select all that apply.",
  },
  {
    key: "staffingRemarks",
    label: "Remarks",
    type: "textarea",
    section: "Staffing",
    required: false,
    active: true,
    order: 23,
    options: [],
    placeholder: "Staffing remarks",
    helpText: "",
  },
  {
    key: "employeesBreaks",
    label: "Employees Breaks",
    type: "select",
    section: "Staffing",
    required: false,
    active: true,
    order: 24,
    options: [
      "All agents have taken their scheduled break",
      "Some agents did not take break",
      "No breaks taken",
      "Modified breaks",
    ],
    placeholder: "",
    helpText: "",
  },
  {
    key: "employeesNoBreakNames",
    label: "Name of Employees / No Break taken",
    type: "textarea",
    section: "Staffing",
    required: false,
    active: true,
    order: 25,
    options: [],
    placeholder: "Names of employees without break",
    helpText: "",
  },
  {
    key: "finalRemarks",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    section: "Final Remarks / Recommendations",
    required: false,
    active: true,
    order: 26,
    options: [],
    placeholder: "Final remarks or recommendations",
    helpText: "",
  },
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
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
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

function emptyForm(order = 1) {
  return {
    key: "",
    label: "",
    type: "text",
    section: DEFAULT_SECTIONS[0],
    required: false,
    active: true,
    order,
    optionsText: "",
    placeholder: "",
    helpText: "",
  };
}

export default function OperationalReportFormBuilderPage() {
  const { user } = useUser();

  const canAccess = user?.role === "station_manager";

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(emptyForm(1));
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    async function loadFields() {
      try {
        const q = query(
          collection(db, "operational_report_form_config"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFields(rows);
      } catch (err) {
        console.error("Error loading operational form config:", err);
        setStatusMessage("Could not load form configuration.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadFields();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const nextOrder = useMemo(() => {
    if (!fields.length) return 1;
    return Math.max(...fields.map((f) => Number(f.order || 0))) + 1;
  }, [fields]);

  const groupedFields = useMemo(() => {
    const map = {};
    fields.forEach((field) => {
      const section = field.section || "Other";
      if (!map[section]) map[section] = [];
      map[section].push(field);
    });

    Object.keys(map).forEach((section) => {
      map[section] = map[section].sort(
        (a, b) => Number(a.order || 0) - Number(b.order || 0)
      );
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
            TPA OPS · Operational Report Builder
          </p>
          <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Access denied
          </h1>
          <p style={{ margin: 0, maxWidth: 700, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            Only Station Managers can manage the operational report form.
          </p>
        </div>
      </div>
    );
  }

  const resetForm = () => {
    setForm(emptyForm(nextOrder));
    setEditingId("");
  };

  const loadIntoEditor = (field) => {
    setEditingId(field.id);
    setForm({
      key: field.key || "",
      label: field.label || "",
      type: field.type || "text",
      section: field.section || DEFAULT_SECTIONS[0],
      required: Boolean(field.required),
      active: field.active !== false,
      order: Number(field.order || 1),
      optionsText: Array.isArray(field.options) ? field.options.join("\n") : "",
      placeholder: field.placeholder || "",
      helpText: field.helpText || "",
    });
  };

  const handleSave = async () => {
    setStatusMessage("");

    const key = String(form.key || "").trim();
    const label = String(form.label || "").trim();

    if (!key) {
      setStatusMessage("Field key is required.");
      return;
    }

    if (!label) {
      setStatusMessage("Field label is required.");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      setStatusMessage("Field key must use only letters, numbers and underscore.");
      return;
    }

    const duplicate = fields.find(
      (item) => item.key === key && item.id !== editingId
    );
    if (duplicate) {
      setStatusMessage("That field key already exists.");
      return;
    }

    const options = String(form.optionsText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (
      (form.type === "select" || form.type === "checkbox_group") &&
      !options.length
    ) {
      setStatusMessage("This field type needs at least one option.");
      return;
    }

    const payload = {
      key,
      label,
      type: form.type,
      section: form.section,
      required: Boolean(form.required),
      active: Boolean(form.active),
      order: Number(form.order || 1),
      options:
        form.type === "select" || form.type === "checkbox_group" ? options : [],
      placeholder: String(form.placeholder || "").trim(),
      helpText: String(form.helpText || "").trim(),
    };

    try {
      setSaving(true);

      if (editingId) {
        await updateDoc(doc(db, "operational_report_form_config", editingId), payload);

        setFields((prev) =>
          prev
            .map((item) => (item.id === editingId ? { ...item, ...payload } : item))
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        );

        setStatusMessage("Field updated successfully.");
      } else {
        const ref = await addDoc(
          collection(db, "operational_report_form_config"),
          payload
        );

        setFields((prev) =>
          [...prev, { id: ref.id, ...payload }].sort(
            (a, b) => Number(a.order || 0) - Number(b.order || 0)
          )
        );

        setStatusMessage("Field created successfully.");
      }

      resetForm();
    } catch (err) {
      console.error("Error saving field:", err);
      setStatusMessage("Could not save field.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field) => {
    const ok = window.confirm(`Delete field "${field.label}"?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "operational_report_form_config", field.id));
      setFields((prev) => prev.filter((item) => item.id !== field.id));
      setStatusMessage("Field deleted.");
      if (editingId === field.id) resetForm();
    } catch (err) {
      console.error("Error deleting field:", err);
      setStatusMessage("Could not delete field.");
    }
  };

  const quickToggleActive = async (field) => {
    try {
      await updateDoc(doc(db, "operational_report_form_config", field.id), {
        active: !field.active,
      });

      setFields((prev) =>
        prev.map((item) =>
          item.id === field.id ? { ...item, active: !item.active } : item
        )
      );
    } catch (err) {
      console.error("Error toggling field:", err);
      setStatusMessage("Could not update field status.");
    }
  };

  const loadStandardTemplate = async () => {
    const ok = window.confirm(
      "Load standard Supervisor Operational Report template?\n\nMissing keys will be added. Existing matching keys will stay unchanged."
    );
    if (!ok) return;

    try {
      setSaving(true);

      const existingKeys = new Set(fields.map((item) => item.key));
      const missing = STANDARD_TEMPLATE.filter((item) => !existingKeys.has(item.key));

      for (const item of missing) {
        await addDoc(collection(db, "operational_report_form_config"), item);
      }

      const q = query(
        collection(db, "operational_report_form_config"),
        orderBy("order", "asc")
      );
      const snap = await getDocs(q);
      setFields(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setStatusMessage("Standard template loaded successfully.");
    } catch (err) {
      console.error("Error loading standard template:", err);
      setStatusMessage("Could not load standard template.");
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

        <div style={{ position: "relative" }}>
          <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
            TPA OPS · Operational Report Builder
          </p>

          <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Manage Operational Report Form
          </h1>

          <p style={{ margin: 0, maxWidth: 760, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            Add, edit, activate, deactivate and reorder questions used in the supervisor operational report.
          </p>
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
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              Standard Template
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Load the Supervisor Operational Report structure based on your attached form.
            </p>
          </div>

          <ActionButton onClick={loadStandardTemplate} variant="success" disabled={saving}>
            Load Standard Template
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {editingId ? "Edit Field" : "Create New Field"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Keys must be unique. Example: operationStatus, issueDetails, staffingRemarks.
            </p>
          </div>

          {editingId && (
            <ActionButton variant="secondary" onClick={resetForm}>
              Cancel Edit
            </ActionButton>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Field Key</FieldLabel>
            <TextInput
              value={form.key}
              onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
              placeholder="operationStatus"
            />
          </div>

          <div>
            <FieldLabel>Field Label</FieldLabel>
            <TextInput
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Operation Status"
            />
          </div>

          <div>
            <FieldLabel>Field Type</FieldLabel>
            <SelectInput
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              {FIELD_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Section</FieldLabel>
            <SelectInput
              value={form.section}
              onChange={(e) => setForm((prev) => ({ ...prev, section: e.target.value }))}
            >
              {DEFAULT_SECTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Order</FieldLabel>
            <TextInput
              type="number"
              min="1"
              value={form.order}
              onChange={(e) => setForm((prev) => ({ ...prev, order: e.target.value }))}
            />
          </div>

          <div>
            <FieldLabel>Placeholder</FieldLabel>
            <TextInput
              value={form.placeholder}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, placeholder: e.target.value }))
              }
              placeholder="Optional placeholder"
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>Help Text</FieldLabel>
          <TextInput
            value={form.helpText}
            onChange={(e) => setForm((prev) => ({ ...prev, helpText: e.target.value }))}
            placeholder="Optional helper text below the field"
          />
        </div>

        {(form.type === "select" || form.type === "checkbox_group") && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>Options (one per line)</FieldLabel>
            <TextArea
              value={form.optionsText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, optionsText: e.target.value }))
              }
              placeholder={"Option 1\nOption 2\nOption 3"}
              style={{ minHeight: 130 }}
            />
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#0f172a" }}>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, required: e.target.checked }))
              }
            />
            Required
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#0f172a" }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, active: e.target.checked }))
              }
            />
            Active
          </label>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update Field" : "Create Field"}
          </ActionButton>

          <ActionButton variant="secondary" onClick={resetForm}>
            Clear
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Current Form Fields
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Active and inactive fields grouped by section.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
            Loading form fields...
          </div>
        ) : fields.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
            No fields configured yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {Object.keys(groupedFields).map((section) => (
              <div
                key={section}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    padding: "14px 16px",
                    background: "#f8fbff",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#1769aa",
                  }}
                >
                  {section}
                </div>

                <div style={{ display: "grid", gap: 0 }}>
                  {groupedFields[section].map((field, index) => (
                    <div
                      key={field.id}
                      style={{
                        padding: 16,
                        borderTop: index === 0 ? "none" : "1px solid #eef2f7",
                        background: field.active ? "#ffffff" : "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                              {field.label}
                            </span>

                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                background: "#edf7ff",
                                border: "1px solid #cfe7fb",
                                color: "#1769aa",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              {field.type}
                            </span>

                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                background: field.active ? "#dcfce7" : "#f1f5f9",
                                border: `1px solid ${field.active ? "#86efac" : "#cbd5e1"}`,
                                color: field.active ? "#166534" : "#475569",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              {field.active ? "ACTIVE" : "INACTIVE"}
                            </span>

                            {field.required && (
                              <span
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  background: "#fff7ed",
                                  border: "1px solid #fdba74",
                                  color: "#9a3412",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                REQUIRED
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13,
                              color: "#475569",
                              lineHeight: 1.6,
                              wordBreak: "break-word",
                            }}
                          >
                            <div><strong>Key:</strong> {field.key}</div>
                            <div><strong>Order:</strong> {field.order || 0}</div>
                            {field.placeholder ? (
                              <div><strong>Placeholder:</strong> {field.placeholder}</div>
                            ) : null}
                            {field.helpText ? (
                              <div><strong>Help text:</strong> {field.helpText}</div>
                            ) : null}
                            {Array.isArray(field.options) && field.options.length > 0 ? (
                              <div><strong>Options:</strong> {field.options.join(", ")}</div>
                            ) : null}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton variant="secondary" onClick={() => loadIntoEditor(field)}>
                            Edit
                          </ActionButton>

                          <ActionButton variant="warning" onClick={() => quickToggleActive(field)}>
                            {field.active ? "Deactivate" : "Activate"}
                          </ActionButton>

                          <ActionButton variant="danger" onClick={() => handleDelete(field)}>
                            Delete
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>
    </div>
  );
}
