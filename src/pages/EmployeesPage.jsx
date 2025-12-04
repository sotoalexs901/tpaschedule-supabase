// src/pages/EmployeesPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);

  // formulario manual
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");

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

  // Crear empleado manualmente
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    await addDoc(collection(db, "employees"), {
      name: name.trim(),
      department: department.trim() || null,
      position: position.trim() || null,
      status,
      active: status.toLowerCase() === "active",
      notes: notes.trim() || null,
      createdAt: new Date().toISOString(),
    });

    setName("");
    setDepartment("");
    setPosition("");
    setStatus("Active");
    setNotes("");
    await loadEmployees();
  };

  // Borrar empleado
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this employee?")) return;
    await deleteDoc(doc(db, "employees", id));
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  // =========================
  //  IMPORTAR PEGANDO TEXTO
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

      // detectamos si la primera línea es header
      const firstLine = lines[0].toLowerCase();
      const hasHeader =
        firstLine.includes("employee") || firstLine.includes("status");

      const startIndex = hasHeader ? 1 : 0;

      let createdCount = 0;

      for (let i = startIndex; i < lines.length; i++) {
        const row = lines[i];
        // acepta separado por coma, tab o punto y coma
        const cells = row.split(/[\t,;]+/).map((c) => c.trim());

        if (!cells[0]) continue; // sin nombre, lo ignoramos

        const employeeName = cells[0];
        const dept = cells[1] || "";
        const pos = cells[2] || "";
        const statusRaw = cells[3] || "Active";
        const notesVal = cells[4] || "";

        const normalizedStatus =
          statusRaw.toLowerCase() === "inactive" ? "Inactive" : "Active";

        await addDoc(collection(db, "employees"), {
          name: employeeName,
          department: dept || null,
          position: pos || null,
          status: normalizedStatus,
          active: normalizedStatus === "Active",
          notes: notesVal || null,
          createdAt: new Date().toISOString(),
        });

        createdCount++;
      }

      setImportStatus(`Imported ${createdCount} employees successfully.`);
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
        <h2 className="text-sm font-semibold">Add Employee</h2>
        <form
          onSubmit={handleAddEmployee}
          className="grid md:grid-cols-5 gap-2 text-xs items-end"
        >
          <div>
            <label className="block mb-1 font-medium">Name</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Department</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Position</label>
            <input
              className="border rounded w-full px-2 py-1 text-xs"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

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

          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Notes</label>
            <textarea
              className="border rounded w-full px-2 py-1 text-xs"
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="md:col-span-1">
            <button
              type="submit"
              className="btn btn-primary w-full text-xs mt-2 md:mt-0"
            >
              Save
            </button>
          </div>
        </form>
      </div>

      {/* IMPORTACIÓN MASIVA POR PEGAR TEXTO */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Import employees (paste data)</h2>
        <p className="text-[11px] text-gray-600">
          Copia y pega desde Excel / Sheets. Formatos aceptados:
          <br />
          <code>Employee Name, Department, Position, Status, Notes</code>
          <br />
          o solo <code>Employee Name, Status</code>. Separador puede ser coma, tab o punto y coma.
          <br />
          La primera línea puede ser un encabezado (Employee Name, Status, ...).
        </p>

        <textarea
          className="border rounded w-full text-xs p-2"
          rows={6}
          placeholder={`Employee Name,Department,Position,Status,Notes
Maria Perez,Ramp,Agent,Active,Full time
Juan Lopez,TC,Lead,Inactive,LOA
...`}
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
                  <td>{e.department}</td>
                  <td>{e.position}</td>
                  <td>{e.status || (e.active ? "Active" : "Inactive")}</td>
                  <td>{e.notes}</td>
                  <td>
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
                  <td colSpan={6} className="text-center text-[11px] py-2">
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
