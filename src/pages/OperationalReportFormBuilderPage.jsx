import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
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

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "yesno", label: "Yes / No" },
  { value: "checkbox-group", label: "Checkbox Group" },
];

const DEFAULT_FIELDS = [
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

export default function OperationalReportFormBuilderPage() {
  const { user } = useUser();

  const canAccess = user?.role === "station_manager";

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [newField, setNewField] = useState({
    label: "",
    key: "",
    type: "text",
    required: false,
    active: true,
    optionsText: "",
  });

  useEffect(() => {
    async function loadFields() {
      try {
        const snap = await getDocs(collection(db, "operational_report_form_fields"));

        if (snap.empty) {
          const seeded = [];
          for (const item of DEFAULT_FIELDS) {
            const ref = await addDoc(collection(db, "operational_report_form_fields"), item);
            seeded.push({ id: ref.id, ...item });
          }
          setFields(seeded);
          return;
        }

        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        setFields(rows);
      } catch (err) {
        console.error("Error loading form fields:", err);
        setStatusMessage("Could not load form builder.");
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

  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [fields]);

  const parseOptions = (text) => {
    return String(text || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const createField = async () => {
    setStatusMessage("");

    if (!newField.label.trim()) {
      setStatusMessage("Field label is required.");
      return;
    }

    const type = newField.type || "text";
    const key = normalizeFieldKey(newField.key || newField.label);
    const options =
      type === "select" || type === "checkbox-group"
        ? parseOptions(newField.optionsText)
        : type === "yesno"
        ? ["Yes", "No"]
        : [];

    if ((type === "select" || type === "checkbox-group") && options.length === 0) {
      setStatusMessage("Please add options for select or checkbox group fields.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        label: newField.label.trim(),
        key,
        type,
        required: Boolean(newField.required),
        active: Boolean(newField.active),
        options,
        order: sortedFields.length + 1,
      };

      const ref = await addDoc(collection(db, "operational_report_form_fields"), payload);

      setFields((prev) => [...prev, { id: ref.id, ...payload }]);

      setNewField({
        label: "",
        key: "",
        type: "text",
        required: false,
        active: true,
        optionsText: "",
      });

      setStatusMessage("Field created successfully.");
    } catch (err) {
      console.error("Error creating field:", err);
      setStatusMessage("Could not create field.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (id, changes) => {
    try {
      await updateDoc(doc(db, "operational_report_form_fields", id), changes);

      setFields((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...changes } : item))
      );

      setStatusMessage("Field updated.");
    } catch (err) {
      console.error("Error updating field:", err);
      setStatusMessage("Could not update field.");
    }
  };

  const updateFieldOptions = async (id, optionsText, type) => {
    const options =
      type === "select" || type === "checkbox-group"
        ? parseOptions(optionsText)
        : type === "yesno"
        ? ["Yes", "No"]
        : [];

    await updateField(id, { options });
  };

  const deleteFieldItem = async (field) => {
    const protectedKeys = [
      "operation_status",
      "general_comments",
      "issue_types",
      "issue_details",
      "action_taken",
      "issue_status",
      "oh_bags_total_quantity",
      "oh_bags_affected_flights",
      "oh_bags_details",
      "oh_bags_follow_up_actions",
      "pending_item_1",
      "pending_description",
      "pending_responsible",
      "pending_target_date",
      "exception_type",
      "exception_description",
      "exception_reason",
      "exception_reported_to",
      "staffing_status",
      "staffing_remarks",
      "employees_breaks",
      "employees_no_break_taken",
      "final_remarks_recommendations",
    ];

    if (protectedKeys.includes(field.key)) {
      setStatusMessage("This base field cannot be deleted. You can deactivate it instead.");
      return;
    }

    const ok = window.confirm(`Delete field "${field.label}"?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "operational_report_form_fields", field.id));
      setFields((prev) => prev.filter((item) => item.id !== field.id));
      setStatusMessage("Field deleted.");
    } catch (err) {
      console.error("Error deleting field:", err);
      setStatusMessage("Could not delete field.");
    }
  };

  const moveField = async (fieldId, direction) => {
    const list = [...sortedFields];
    const index = list.findIndex((item) => item.id === fieldId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const updated = list.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));

    setFields(updated);

    try {
      await Promise.all(
        updated.map((item) =>
          updateDoc(doc(db, "operational_report_form_fields", item.id), {
            order: item.order,
          })
        )
      );
    } catch (err) {
      console.error("Error reordering fields:", err);
      setStatusMessage("Could not reorder fields.");
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
        <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
          TPA OPS · Operational Reports
        </p>
        <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
          Operational Report Builder
        </h1>
        <p style={{ margin: 0, maxWidth: 760, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
          Create, activate, reorder, edit, or remove dynamic questions for the supervisor operational report.
        </p>
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
            Add New Field
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
            <FieldLabel>Field Label</FieldLabel>
            <TextInput
              value={newField.label}
              onChange={(e) =>
                setNewField((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="Example: Ramp Condition"
            />
          </div>

          <div>
            <FieldLabel>Field Key (optional)</FieldLabel>
            <TextInput
              value={newField.key}
              onChange={(e) =>
                setNewField((prev) => ({ ...prev, key: e.target.value }))
              }
              placeholder="ramp_condition"
            />
          </div>

          <div>
            <FieldLabel>Field Type</FieldLabel>
            <SelectInput
              value={newField.type}
              onChange={(e) =>
                setNewField((prev) => ({ ...prev, type: e.target.value }))
              }
            >
              {FIELD_TYPE_OPTIONS.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Required</FieldLabel>
            <SelectInput
              value={newField.required ? "yes" : "no"}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  required: e.target.value === "yes",
                }))
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Active</FieldLabel>
            <SelectInput
              value={newField.active ? "yes" : "no"}
              onChange={(e) =>
                setNewField((prev) => ({
                  ...prev,
                  active: e.target.value === "yes",
                }))
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </SelectInput>
          </div>
        </div>

        {(newField.type === "select" || newField.type === "checkbox-group") && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>Options (one per line)</FieldLabel>
            <TextArea
              value={newField.optionsText}
              onChange={(e) =>
                setNewField((prev) => ({ ...prev, optionsText: e.target.value }))
              }
              placeholder={`Example:
Yes
No
N/A`}
            />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <ActionButton onClick={createField} disabled={saving}>
            {saving ? "Saving..." : "Add Field"}
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
            Existing Fields
          </h2>
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
            Loading fields...
          </div>
        ) : sortedFields.length === 0 ? (
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
            No fields configured.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {sortedFields.map((field, index) => (
              <div
                key={field.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 16,
                  background: "#fff",
                }}
              >
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
                      defaultValue={field.label || ""}
                      onBlur={(e) =>
                        updateField(field.id, { label: e.target.value.trim() })
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Key</FieldLabel>
                    <TextInput
                      defaultValue={field.key || ""}
                      onBlur={(e) =>
                        updateField(field.id, { key: normalizeFieldKey(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <SelectInput
                      value={field.type || "text"}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const nextChanges = {
                          type: nextType,
                          options:
                            nextType === "yesno"
                              ? ["Yes", "No"]
                              : nextType === "text" || nextType === "textarea"
                              ? []
                              : field.options || [],
                        };
                        updateField(field.id, nextChanges);
                      }}
                    >
                      {FIELD_TYPE_OPTIONS.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Required</FieldLabel>
                    <SelectInput
                      value={field.required ? "yes" : "no"}
                      onChange={(e) =>
                        updateField(field.id, {
                          required: e.target.value === "yes",
                        })
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Active</FieldLabel>
                    <SelectInput
                      value={field.active === false ? "no" : "yes"}
                      onChange={(e) =>
                        updateField(field.id, {
                          active: e.target.value === "yes",
                        })
                      }
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Order</FieldLabel>
                    <TextInput value={String(field.order || index + 1)} disabled />
                  </div>
                </div>

                {(field.type === "select" || field.type === "checkbox-group") && (
                  <div style={{ marginTop: 14 }}>
                    <FieldLabel>Options (one per line)</FieldLabel>
                    <TextArea
                      defaultValue={Array.isArray(field.options) ? field.options.join("\n") : ""}
                      onBlur={(e) =>
                        updateFieldOptions(field.id, e.target.value, field.type)
                      }
                    />
                  </div>
                )}

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={() => moveField(field.id, "up")}
                    disabled={index === 0}
                  >
                    ↑ Move Up
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={() => moveField(field.id, "down")}
                    disabled={index === sortedFields.length - 1}
                  >
                    ↓ Move Down
                  </ActionButton>

                  <ActionButton
                    variant="danger"
                    onClick={() => deleteFieldItem(field)}
                  >
                    Delete
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>
    </div>
  );
}
