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

  // importación
  const [importFile, setImportFile] = useState(null);
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
  //  IMPORTAR DESDE CSV/TXT
  // =========================
  const handleFileChange = (e) => {
    setImportFile(e.target.files?.[0] || null);
    setImportStatus("");
  };

  const handleImport = () => {
    if (!importFile) {
      setImportStatus("Please select a CSV/TXT file first.");
      return;
    }

    setImportStatus("Reading file...");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;

        // separamos por líneas
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          setImportStatus("File seems to be empty or has no data rows.");
          return;
        }

        // primera línea = headers
        const headerLine = lines[0];
        const headers = headerLine
          .split(/[\t,;]+/)
          .map((h) => h.trim().toLowerCase());

        const idxName = headers.findIndex((h) =>
          ["employee name", "name"].includes(h)
        );
        const idxDept = headers.findIndex((h) =>
          ["department", "dept"].includes(h)
        );
        const idxPos = headers.findIndex((h) =>
          ["position", "job", "role"].includes(h)
        );
        const idxStatus = headers.findIndex((h) => h === "status");
        const idxNotes = headers.findIndex((h) => h === "notes");

        if (idxName === -1) {
          setImportStatus(
            "Missing 'Employee Name' column in the first row (header)."
          );
          return;
        }

        let createdCount = 0;

        // procesamos cada fila de datos
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          const cells = row.split(/[\t,;]+/);

          const employeeName = cells[idxName]?.trim();
          if (!employeeName) continue; // saltar filas sin nombre

          const dept = idxDept >= 0 ? cells[idxDept]?.trim() : "";
          const pos = idxPos >= 0 ? cells[idxPos]?.trim() : "";
          const statusRaw = idxStatus >= 0 ? cells[idxStatus]?.trim() : "Active";
          const notesVal = idxNotes >= 0 ? cells[idxNotes]?.trim() : "";

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
        setImportFile(null);
        await loadEmployees();
      } catch (err) {
        console.error(err);
        setImportStatus("Error importing file. Check console for details.");
      }
    };

    reader.onerror = () => {
      setImportStatus("Error reading file.");
    };

    reader.readAsText(importFile);
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

      {/* IMPORTACIÓN MASIVA */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Import employees from CSV</h2>
        <p className="text-[11px] text-gray-600">
          Upload a <b>.csv</b> or <b>.txt</b> file with this header:
          <br />
          <code>
            Employee Name, Department, Position, Status, Notes
          </code>
          <br />
          Status must be <b>Active</b> or <b>Inactive</b>.
        </p>

        <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
          <input
            type="file"
            accept=".csv,.txt"
            className="text-xs"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="btn text-xs"
            onClick={handleImport}
          >
            Import file
          </button>
        </div>

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
