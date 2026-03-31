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

function slugifyLabel(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Dropdown" },
  { value: "yesno", label: "Yes / No" },
  { value: "checkbox-group", label: "Checkbox Group" },
];

const PROTECTED_BASE_FIELDS = [
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
    system: true,
  },
  {
    key: "general_comments",
    label: "General Comments",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 2,
    system: true,
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
    system: true,
  },
  {
    key: "issue_details",
    label: "Issue Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 4,
    system: true,
  },
  {
    key: "action_taken",
    label: "Action Taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 5,
    system: true,
  },
  {
    key: "issue_status",
    label: "Status",
    type: "select",
    required: false,
    options: ["N/A", "Resolved", "Pending", "Escalated"],
    active: true,
    order: 6,
    system: true,
  },
  {
    key: "oh_bags_total_quantity",
    label: "OH Bags Total Quantity",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 7,
    system: true,
  },
  {
    key: "oh_bags_affected_flights",
    label: "OH Bags Affected Flights",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 8,
    system: true,
  },
  {
    key: "oh_bags_details",
    label: "OH Bags Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 9,
    system: true,
  },
  {
    key: "oh_bags_follow_up_actions",
    label: "OH Bags Follow-up Actions",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 10,
    system: true,
  },
  {
    key: "pending_item_1",
    label: "Pending Item 1",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 11,
    system: true,
  },
  {
    key: "pending_description",
    label: "Pending Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
    system: true,
  },
  {
    key: "pending_responsible",
    label: "Pending Responsible",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 13,
    system: true,
  },
  {
    key: "pending_target_date",
    label: "Pending Target Date",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 14,
    system: true,
  },
  {
    key: "exception_type",
    label: "Exception Type (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["N/A", "Operational", "Staffing", "Safety", "Baggage", "Other"],
    active: true,
    order: 15,
    system: true,
  },
  {
    key: "exception_description",
    label: "Exception Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 16,
    system: true,
  },
  {
    key: "exception_reason",
    label: "Exception Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 17,
    system: true,
  },
  {
    key: "exception_reported_to",
    label: "Reported To",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 18,
    system: true,
  },
  {
    key: "staffing_status",
    label: "Staffing Status (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["Full staffing", "Short staffed", "Overtime needed", "Call out", "Other"],
    active: true,
    order: 19,
    system: true,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 20,
    system: true,
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
    system: true,
  },
  {
    key: "employees_no_break_taken",
    label: "Name of Employees / No Break taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 22,
    system: true,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 23,
    system: true,
  },
];

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
    system: false,
  }));

  const builderMap = {};
  normalizedBuilder.forEach((field) => {
    if (!field.key) return;
    builderMap[field.key] = field;
  });

  const mergedBase = baseFields.map((base, index) => {
    const override = builderMap[base.key];

    if (!override) {
      return {
        ...base,
        order: Number(base.order || index + 1),
      };
    }

    return {
      ...base,
      ...override,
      key: base.key,
      options:
        override.type === "yesno"
          ? ["Yes", "No"]
          : override.options?.length
          ? override.options
          : base.options || [],
      system: true,
    };
  });

  const baseKeys = new Set(baseFields.map((field) => field.key));

  const extras = normalizedBuilder.filter(
    (field) => field.key && !baseKeys.has(field.key)
  );

  return [...mergedBase, ...extras].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );
}

function emptyNewField(nextOrder) {
  return {
    label: "",
    key: "",
    type: "text",
    required: false,
    active: true,
    order: nextOrder,
    optionsText: "",
  };
}

export default function OperationalReportFormBuilderPage() {
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [builderDocs, setBuilderDocs] = useState([]);
  const [newField, setNewField] = useState(emptyNewField(100));

  useEffect(() => {
    async function loadFields() {
      try {
        const q = query(
          collection(db, "operational_report_form_fields"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setBuilderDocs(rows);
      } catch (err) {
        console.error("Error loading form builder fields:", err);
        setStatusMessage("Could not load form fields.");
      } finally {
        setLoading(false);
      }
    }

    loadFields();
  }, []);

  const mergedFields = useMemo(() => {
    return mergeBaseFieldsWithBuilder(PROTECTED_BASE_FIELDS, builderDocs);
  }, [builderDocs]);

  const nextSuggestedOrder = useMemo(() => {
    const maxOrder = mergedFields.reduce(
      (max, item) => Math.max(max, Number(item.order || 0)),
      0
    );
    return maxOrder + 1;
  }, [mergedFields]);

  useEffect(() => {
    setNewField((prev) => ({
      ...prev,
      order: prev.order || nextSuggestedOrder,
    }));
  }, [nextSuggestedOrder]);

  const updateExistingField = async (field, patch) => {
    try {
      if (field.system && !field.id) {
        const payload = {
          key: field.key,
          label: patch.label ?? field.label,
          type: patch.type ?? field.type,
          required:
            patch.required !== undefined ? patch.required : Boolean(field.required),
          active: patch.active !== undefined ? patch.active : field.active !== false,
          order:
            patch.order !== undefined ? Number(patch.order) : Number(field.order || 0),
          options:
            patch.options !== undefined
              ? patch.options
              : Array.isArray(field.options)
              ? field.options
              : [],
        };

        const created = await addDoc(
          collection(db, "operational_report_form_fields"),
          payload
        );

        setBuilderDocs((prev) => [
          ...prev,
          {
            id: created.id,
            ...payload,
          },
        ]);

        setStatusMessage(`Saved changes for "${field.label}".`);
        return;
      }

      if (!field.id) return;

      const payload = {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.required !== undefined ? { required: patch.required } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.order !== undefined ? { order: Number(patch.order) } : {}),
        ...(patch.options !== undefined ? { options: patch.options } : {}),
      };

      await updateDoc(doc(db, "operational_report_form_fields", field.id), payload);

      setBuilderDocs((prev) =>
        prev.map((item) =>
          item.id === field.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setStatusMessage(`Updated "${field.label}".`);
    } catch (err) {
      console.error("Error updating field:", err);
      setStatusMessage("Could not update field.");
    }
  };

  const deleteExtraField = async (field) => {
    if (field.system) {
      setStatusMessage("Protected fields cannot be removed. You can only edit, activate or deactivate them.");
      return;
    }

    if (!field.id) return;

    const confirmed = window.confirm(`Delete "${field.label}"?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "operational_report_form_fields", field.id));
      setBuilderDocs((prev) => prev.filter((item) => item.id !== field.id));
      setStatusMessage(`Deleted "${field.label}".`);
    } catch (err) {
      console.error("Error deleting field:", err);
      setStatusMessage("Could not delete field.");
    }
  };

  const createField = async () => {
    setStatusMessage("");

    const label = String(newField.label || "").trim();
    const key =
      String(newField.key || "").trim() || slugifyLabel(newField.label || "");
    const type = String(newField.type || "text");
    const required = Boolean(newField.required);
    const active = Boolean(newField.active);
    const order = Number(newField.order || nextSuggestedOrder);
    const options =
      type === "select" || type === "checkbox-group"
        ? String(newField.optionsText || "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : type === "yesno"
        ? ["Yes", "No"]
        : [];

    if (!label) {
      setStatusMessage("Please enter a field label.");
      return;
    }

    if (!key) {
      setStatusMessage("Could not generate a field key.");
      return;
    }

    const existingKey = mergedFields.some((field) => field.key === key);
    if (existingKey) {
      setStatusMessage("That field key already exists. Please use another one.");
      return;
    }

    try {
      setSavingNew(true);

      const payload = {
        key,
        label,
        type,
        required,
        active,
        order,
        options,
      };

      const created = await addDoc(
        collection(db, "operational_report_form_fields"),
        payload
      );

      setBuilderDocs((prev) => [
        ...prev,
        {
          id: created.id,
          ...payload,
        },
      ]);

      setNewField(emptyNewField(order + 1));
      setStatusMessage(`Field "${label}" created successfully.`);
    } catch (err) {
      console.error("Error creating field:", err);
      setStatusMessage("Could not create field.");
    } finally {
      setSavingNew(false);
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
            Operational Report Builder
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Protected fields only allow edit, activate or deactivate. Custom fields can also be removed.
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
            Add New Field
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Label</FieldLabel>
            <TextInput
              value={newField.label}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  label: e.target.value,
                  key: slugifyLabel(e.target.value),
                }))
              }
              placeholder="Field label"
            />
          </div>

          <div>
            <FieldLabel>Key</FieldLabel>
            <TextInput
              value={newField.key}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  key: slugifyLabel(e.target.value),
                }))
              }
              placeholder="field_key"
            />
          </div>

          <div>
            <FieldLabel>Type</FieldLabel>
            <SelectInput
              value={newField.type}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  type: e.target.value,
                }))
              }
            >
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Order</FieldLabel>
            <TextInput
              type="number"
              value={newField.order}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  order: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {(newField.type === "select" || newField.type === "checkbox-group") && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>Options (one per line)</FieldLabel>
            <TextArea
              value={newField.optionsText}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  optionsText: e.target.value,
                }))
              }
              placeholder={"Option 1\nOption 2\nOption 3"}
            />
          </div>
        )}

        <div
          style={{
            marginTop: 14,
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
              color: "#0f172a",
            }}
          >
            <input
              type="checkbox"
              checked={newField.required}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  required: e.target.checked,
                }))
              }
            />
            Required
          </label>

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
              checked={newField.active}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  active: e.target.checked,
                }))
              }
            />
            Active
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <ActionButton
            variant="primary"
            onClick={createField}
            disabled={savingNew}
          >
            {savingNew ? "Saving..." : "Add Field"}
          </ActionButton>
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
            Current Form Fields
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Protected fields cannot be removed. They only allow edit, activate, or deactivate.
          </p>
        </div>

        {loading ? (
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
          <div style={{ display: "grid", gap: 14 }}>
            {mergedFields.map((field) => {
              const optionsText = Array.isArray(field.options)
                ? field.options.join("\n")
                : "";

              return (
                <div
                  key={field.id || field.key}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    padding: 16,
                    background: field.active === false ? "#f8fafc" : "#ffffff",
                    opacity: field.active === false ? 0.85 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {field.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        key: {field.key} {field.system ? "• protected field" : "• custom field"}
                      </div>
                    </div>

                    {!field.system && (
                      <ActionButton
                        variant="danger"
                        onClick={() => deleteExtraField(field)}
                      >
                        Delete
                      </ActionButton>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <FieldLabel>Label</FieldLabel>
                      <TextInput
                        defaultValue={field.label}
                        onBlur={(e) =>
                          updateExistingField(field, { label: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Key</FieldLabel>
                      <TextInput
                        value={field.key}
                        disabled
                        style={{
                          background: "#f8fafc",
                          color: "#64748b",
                          cursor: "not-allowed",
                        }}
                      />
                    </div>

                    <div>
                      <FieldLabel>Type</FieldLabel>
                      <SelectInput
                        defaultValue={field.type}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          const nextOptions =
                            nextType === "yesno"
                              ? ["Yes", "No"]
                              : nextType === "text" || nextType === "textarea"
                              ? []
                              : Array.isArray(field.options)
                              ? field.options
                              : [];

                          updateExistingField(field, {
                            type: nextType,
                            options: nextOptions,
                          });
                        }}
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectInput>
                    </div>

                    <div>
                      <FieldLabel>Order</FieldLabel>
                      <TextInput
                        type="number"
                        defaultValue={field.order}
                        onBlur={(e) =>
                          updateExistingField(field, {
                            order: Number(e.target.value || 0),
                          })
                        }
                      />
                    </div>
                  </div>

                  {(field.type === "select" || field.type === "checkbox-group") && (
                    <div style={{ marginTop: 12 }}>
                      <FieldLabel>Options (one per line)</FieldLabel>
                      <TextArea
                        defaultValue={optionsText}
                        onBlur={(e) =>
                          updateExistingField(field, {
                            options: String(e.target.value || "")
                              .split("\n")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 12,
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
                        color: "#0f172a",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) =>
                          updateExistingField(field, {
                            required: e.target.checked,
                          })
                        }
                      />
                      Required
                    </label>

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
                        checked={field.active !== false}
                        onChange={(e) =>
                          updateExistingField(field, {
                            active: e.target.checked,
                          })
                        }
                      />
                      Active
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageCard>
    </div>
  );
}
