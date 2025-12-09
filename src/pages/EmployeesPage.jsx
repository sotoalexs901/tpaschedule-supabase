// src/pages/EmployeesPage.jsx
import React, { useEffect, useState } from "react";
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

// 🔗 Sincroniza empleado ↔ users.username
async function syncUserLink(employeeId, loginUsername) {
  if (!loginUsername) return;
  try {
    const q = query(
      collection(db, "users"),
      where("username", "==", loginUsername)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    // Si hay varios, los actualizamos todos por seguridad
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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);

  // formulario manual
  const [name, setName] = useState("");
  const [username, setUsername] = useState(""); // ✅ NEW (loginUsername)
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState(null); // ✅ estamos editando un empleado?
  const [formMessage, setFormMessage] = useState("");

  // importación por pegar texto
  const [bulkText, setBulkText] = useState("");
  const [importStatus, setImportStatus] = useState("");

  // Cargar empleados
  const loadEmployees = async () => {
    const snap = await getDocs(collection(db, "employees"));
    setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadEmployees().catch(console.error);
  }, []);

  // =========================
  //  CREAR / EDITAR EMPLEADO
  // =========================
  const handleAddOrUpdateEmployee = async (e) => {
    e.preventDefault();
    setFormMessage("");

    const cleanName = name.trim();
    const cleanUsername = username.trim();

    if (!cleanName) {
      setFormMessage("Name is required.");
      return;
    }

    // 🚫 Chequeo de username duplicado (entre empleados)
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
        // ✏️ UPDATE
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
        // ➕ CREATE
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

      // Limpiar formulario
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

  // Borrar empleado
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
  };

  // =========================
  //  IMPORTAR PEGANDO TEXTO
  //  Formato recomendado:
  //  Name, Username(optional), Department, Position, Status, Notes
  // =========================
  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      setImportStatus("Paste some data first.");
      return;
    }

    setImportStatus("Processing…");

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

      // Set de usernames ya existentes para evitar duplicados
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

        // acepta separado por coma, tab o punto y coma
        const cells = row.split(/[\t,;]+/).map((c) => c.trim());
        if (!cells[0]) continue; // sin nombre, ignoramos

        const employeeName = cells[0];
        const loginUsername = cells[1] || "";
        const dept = cells[2] || "";
        const pos = cells[3] || "";
        const statusRaw = cells[4] || "Active";
        const notesVal = cells[5] || "";

        const normalizedStatus =
          statusRaw.toLowerCase() === "inactive" ? "Inactive" : "Active";

        // 🚫 Evitar duplicados de username
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

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold mb-2">Employees</h1>

      {/* FORMULARIO MANUAL */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">
          {editingId ? "Edit Employee" : "Add Employee"}
        </h2>

        <form
          onSubmit={handleAddOrUpdateEmployee}
          className="grid md:grid-cols-6 gap-2 text-xs items-end"
        >
          {/* Name */}
          <div>
            <label className="block mb-1 font-medium">Name</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Username */}
          <div>
            <label className="block mb-1 font-medium">
              Username (login)
            </label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Same as Login Page"
            />
          </div>

          {/* Department */}
          <div>
            <label className="block mb-1 font-medium">Department</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          {/* Position */}
          <div>
            <label className="block mb-1 font-medium">Position</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block mb-1 font-medium">Status</label>
            <select
              className="border rounded w-full px-2 py-1 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Notes</label>
            <textarea
              className="border rounded w-full px-2 py-1 text-xs"
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Botones */}
          <div className="md:col-span-1 flex gap-2 mt-2 md:mt-0">
            <button
              type="submit"
              className="btn btn-primary w-full text-xs"
            >
              {editingId ? "Update" : "Save"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn text-xs"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {formMessage && (
          <p className="text-[11px] text-gray-700 mt-1">{formMessage}</p>
        )}
      </div>

      {/* IMPORTACIÓN MASIVA POR PEGAR TEXTO */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Import employees (paste data)</h2>
        <p className="text-[11px] text-gray-600">
          Format (comma / tab separated):<br />
          <code>
            Name, Username(optional), Department, Position, Status, Notes
          </code>
        </p>

        <textarea
          className="border rounded w-full text-xs p-2"
          rows={6}
          placeholder={`Maria Perez, mperez, Ramp, Agent, Active, Full time
Juan Lopez, jlopez, TC, Lead, Inactive, LOA`}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />

        <button
          type="button"
          className="btn text-xs mt-1"
          onClick={handleBulkImport}
        >
          Import from pasted text
        </button>

        {importStatus && (
          <p className="text-[11px] text-gray-700 mt-1">{importStatus}</p>
        )}
      </div>

      {/* LISTA DE EMPLEADOS */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-2">Current Employees</h2>
        <div className="overflow-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Department</th>
                <th>Position</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.loginUsername || "—"}</td>
                  <td>{e.department}</td>
                  <td>{e.position}</td>
                  <td>{e.status || (e.active ? "Active" : "Inactive")}</td>
                  <td>{e.notes}</td>
                  <td className="space-x-1">
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => handleStartEdit(e)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => handleDelete(e.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-[11px] py-2">
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
