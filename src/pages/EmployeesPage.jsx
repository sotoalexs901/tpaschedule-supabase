// src/pages/EmployeesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

async function syncUserLink(employeeId, loginUsername) {
  if (!loginUsername) return;
  try {
    const q = query(
      collection(db, "users"),
      where("username", "==", loginUsername)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const updates = snap.docs.map((u) =>
      updateDoc(u.ref, {
        employeeId,
      })
    );
    await Promise.all(updates);
  } catch (err) {
    console.error("Error syncing user link:", err);
  }
}

function getEmployeeDisplayName(emp) {
  return (
    emp?.name ||
    emp?.fullName ||
    emp?.displayName ||
    emp?.employeeName ||
    ""
  ).trim();
}

function getLastNameInitial(emp) {
  const fullName = getEmployeeDisplayName(emp);
  if (!fullName) return "#";

  const parts = fullName.split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const initial = lastName.charAt(0).toUpperCase();

  return /[A-Z]/.test(initial) ? initial : "#";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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
  type = "button",
  variant = "primary",
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
      boxShadow: "0 10px 20px rgba(245,158,11,0.18)",
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
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [formMessage, setFormMessage] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [importStatus, setImportStatus] = useState("");

  const loadEmployees = async () => {
    const snap = await getDocs(collection(db, "employees"));
    setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadEmployees().catch(console.error);
  }, []);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const aInitial = getLastNameInitial(a);
      const bInitial = getLastNameInitial(b);

      if (aInitial !== bInitial) {
        if (aInitial === "#") return 1;
        if (bInitial === "#") return -1;
        return aInitial.localeCompare(bInitial);
      }

      const aDepartment = normalizeText(a.department);
      const bDepartment = normalizeText(b.department);
      if (aDepartment !== bDepartment) {
        return aDepartment.localeCompare(bDepartment);
      }

      const aPosition = normalizeText(a.position);
      const bPosition = normalizeText(b.position);
      if (aPosition !== bPosition) {
        return aPosition.localeCompare(bPosition);
      }

      return getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b));
    });
  }, [employees]);

  const handleAddOrUpdateEmployee = async (e) => {
    e.preventDefault();
    setFormMessage("");

    const cleanName = name.trim();
    const cleanUsername = username.trim();

    if (!cleanName) {
      setFormMessage("Name is required.");
      return;
    }

    if (cleanUsername) {
      const exists = employees.some(
        (emp) =>
          (emp.loginUsername || "").toLowerCase() ===
            cleanUsername.toLowerCase() && emp.id !== editingId
      );
      if (exists) {
        setFormMessage(
          "This username is already linked to another employee. Please use a different one."
        );
        return;
      }
    }

    try {
      if (editingId) {
        const ref = doc(db, "employees", editingId);
        await updateDoc(ref, {
          name: cleanName,
          loginUsername: cleanUsername || null,
          department: department.trim() || null,
          position: position.trim() || null,
          status,
          active: status.toLowerCase() === "active",
          notes: notes.trim() || null,
        });

        await syncUserLink(editingId, cleanUsername);
        setFormMessage("Employee updated successfully.");
      } else {
        const ref = await addDoc(collection(db, "employees"), {
          name: cleanName,
          loginUsername: cleanUsername || null,
          department: department.trim() || null,
          position: position.trim() || null,
          status,
          active: status.toLowerCase() === "active",
          notes: notes.trim() || null,
          createdAt: new Date().toISOString(),
        });

        await syncUserLink(ref.id, cleanUsername);
        setFormMessage("Employee created successfully.");
      }

      setName("");
      setUsername("");
      setDepartment("");
      setPosition("");
      setStatus("Active");
      setNotes("");
      setEditingId(null);

      await loadEmployees();
    } catch (err) {
      console.error(err);
      setFormMessage("Error saving employee. Check console for details.");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setUsername("");
    setDepartment("");
    setPosition("");
    setStatus("Active");
    setNotes("");
    setFormMessage("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this employee?")) return;
    await deleteDoc(doc(db, "employees", id));
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  const handleStartEdit = (emp) => {
    setEditingId(emp.id);
    setName(emp.name || "");
    setUsername(emp.loginUsername || "");
    setDepartment(emp.department || "");
    setPosition(emp.position || "");
    setStatus(emp.status || (emp.active ? "Active" : "Inactive"));
    setNotes(emp.notes || "");
    setFormMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      setImportStatus("Paste some data first.");
      return;
    }

    setImportStatus("Processing...");

    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setImportStatus("No valid lines found.");
        return;
      }

      const firstLine = lines[0].toLowerCase();
      const hasHeader =
        firstLine.includes("employee") || firstLine.includes("status");

      const startIndex = hasHeader ? 1 : 0;

      const existingUsernames = new Set(
        employees
          .map((e) => (e.loginUsername || "").toLowerCase())
          .filter(Boolean)
      );
      const batchUsernames = new Set();

      let createdCount = 0;
      let skippedDuplicates = 0;

      for (let i = startIndex; i < lines.length; i++) {
        const row = lines[i];
        const cells = row.split(/[\t,;]+/).map((c) => c.trim());
        if (!cells[0]) continue;

        const employeeName = cells[0];
        const loginUsername = cells[1] || "";
        const dept = cells[2] || "";
        const pos = cells[3] || "";
        const statusRaw = cells[4] || "Active";
        const notesVal = cells[5] || "";

        const normalizedStatus =
          statusRaw.toLowerCase() === "inactive" ? "Inactive" : "Active";

        if (loginUsername) {
          const key = loginUsername.toLowerCase();
          if (existingUsernames.has(key) || batchUsernames.has(key)) {
            skippedDuplicates++;
            continue;
          }
          batchUsernames.add(key);
        }

        const ref = await addDoc(collection(db, "employees"), {
          name: employeeName,
          loginUsername: loginUsername || null,
          department: dept || null,
          position: pos || null,
          status: normalizedStatus,
          active: normalizedStatus === "Active",
          notes: notesVal || null,
          createdAt: new Date().toISOString(),
        });

        await syncUserLink(ref.id, loginUsername);
        createdCount++;
      }

      let msg = `Imported ${createdCount} employees successfully.`;
      if (skippedDuplicates > 0) {
        msg += ` Skipped ${skippedDuplicates} line(s) because username was already used.`;
      }

      setImportStatus(msg);
      setBulkText("");
      await loadEmployees();
    } catch (err) {
      console.error(err);
      setImportStatus("Error importing data. Check console for details.");
    }
  };

  const formSuccess = formMessage.toLowerCase().includes("success");
  const importSuccess = importStatus.toLowerCase().includes("imported");

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
            TPA OPS · Administration
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
            Employees
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Create, edit and import employee records, and link them to login
            usernames for scheduling visibility.
          </p>
        </div>
      </div>

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
            {editingId ? "Edit Employee" : "Add Employee"}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Keep the employee profile and login username in sync.
          </p>
        </div>

        <form
          onSubmit={handleAddOrUpdateEmployee}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Name</FieldLabel>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <FieldLabel>Username (login)</FieldLabel>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Same as Login Page"
            />
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Position</FieldLabel>
            <TextInput
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </SelectInput>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Notes</FieldLabel>
            <TextArea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <ActionButton type="submit" variant="primary">
              {editingId ? "Update Employee" : "Save Employee"}
            </ActionButton>

            {editingId && (
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleCancelEdit}
              >
                Cancel
              </ActionButton>
            )}
          </div>
        </form>

        {formMessage && (
          <div
            style={{
              marginTop: 14,
              background: formSuccess ? "#ecfdf5" : "#fff1f2",
              border: `1px solid ${formSuccess ? "#a7f3d0" : "#fecdd3"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: formSuccess ? "#065f46" : "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {formMessage}
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
            Import Employees
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Paste rows using comma, tab or semicolon separated values in this
            format:
            <br />
            <code>
              Name, Username(optional), Department, Position, Status, Notes
            </code>
          </p>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <TextArea
            rows={7}
            placeholder={`Maria Perez, mperez, Ramp, Agent, Active, Full time
Juan Lopez, jlopez, TC, Lead, Inactive, LOA`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <ActionButton onClick={handleBulkImport} variant="secondary">
              Import from pasted text
            </ActionButton>
          </div>

          {importStatus && (
            <div
              style={{
                background: importSuccess ? "#ecfdf5" : "#fff7ed",
                border: `1px solid ${importSuccess ? "#a7f3d0" : "#fed7aa"}`,
                borderRadius: 16,
                padding: "14px 16px",
                color: importSuccess ? "#065f46" : "#9a3412",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {importStatus}
            </div>
          )}
        </div>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
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
            Current Employees
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Organized by last name initial, department and position.
          </p>
        </div>

        <div
          style={{
            overflowX: "auto",
            borderRadius: 18,
            border: "1px solid #e2e8f0",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              minWidth: 980,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle({ textAlign: "left" })}>Last Initial</th>
                <th style={thStyle({ textAlign: "left" })}>Name</th>
                <th style={thStyle({ textAlign: "left" })}>Username</th>
                <th style={thStyle({ textAlign: "left" })}>Department</th>
                <th style={thStyle({ textAlign: "left" })}>Position</th>
                <th style={thStyle({ textAlign: "left" })}>Status</th>
                <th style={thStyle({ textAlign: "left" })}>Notes</th>
                <th style={thStyle({ textAlign: "center" })}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedEmployees.map((e, index) => (
                <tr
                  key={e.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>{getLastNameInitial(e)}</td>
                  <td style={tdStyle}>{e.name}</td>
                  <td style={tdStyle}>{e.loginUsername || "—"}</td>
                  <td style={tdStyle}>{e.department || "—"}</td>
                  <td style={tdStyle}>{e.position || "—"}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background:
                          (e.status || (e.active ? "Active" : "Inactive")) ===
                          "Active"
                            ? "#ecfdf5"
                            : "#fff1f2",
                        color:
                          (e.status || (e.active ? "Active" : "Inactive")) ===
                          "Active"
                            ? "#065f46"
                            : "#9f1239",
                        border: `1px solid ${
                          (e.status || (e.active ? "Active" : "Inactive")) ===
                          "Active"
                            ? "#a7f3d0"
                            : "#fecdd3"
                        }`,
                      }}
                    >
                      {e.status || (e.active ? "Active" : "Inactive")}
                    </span>
                  </td>
                  <td style={tdStyle}>{e.notes || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <ActionButton
                        type="button"
                        variant="secondary"
                        onClick={() => handleStartEdit(e)}
                      >
                        Edit
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="danger"
                        onClick={() => handleDelete(e.id)}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}

              {sortedEmployees.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "18px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
