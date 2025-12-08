// src/pages/CreateUserPage.jsx
import React, { useState, useEffect } from "react";
import { addDoc, collection, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function CreateUserPage() {
  const { user } = useUser();

  // Solo station_manager puede crear usuarios
  if (!user || user.role !== "station_manager") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Access denied — Only Station Managers can create users.
        </h1>
      </div>
    );
  }

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("agent");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Cargar empleados para poder vincular el usuario con un employeeId
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Ordenamos por nombre para que sea más fácil buscar
        list.sort((a, b) => {
          const na = (a.name || "").toLowerCase();
          const nb = (b.name || "").toLowerCase();
          if (na < nb) return -1;
          if (na > nb) return 1;
          return 0;
        });

        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees:", err);
      }
    }

    loadEmployees();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!username || !pin || !role) {
      setMessage("All fields are required (username, PIN, role).");
      return;
    }

    if (pin.length < 4) {
      setMessage("PIN should be at least 4 digits.");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        username: username.trim(),
        pin: pin.trim(),
        role,
        createdAt: serverTimestamp(),
      };

      // Solo agregamos employeeId si se seleccionó alguno
      if (employeeId) {
        payload.employeeId = employeeId;
      }

      await addDoc(collection(db, "users"), payload);

      setUsername("");
      setPin("");
      setRole("agent");
      setEmployeeId("");

      setMessage("User created successfully!");
    } catch (error) {
      console.error(error);
      setMessage("Error creating user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Create New User</h1>

      <form onSubmit={createUser} className="card space-y-3 p-4">
        <div>
          <label className="text-sm font-medium">Username</label>
          <input
            className="border rounded w-full px-2 py-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
          />
        </div>

        <div>
          <label className="text-sm font-medium">PIN</label>
          <input
            type="password"
            className="border rounded w-full px-2 py-1"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-digit PIN"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Select Role</label>
          <select
            className="border rounded w-full px-2 py-1"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="agent">Agent</option>
            <option value="supervisor">Supervisor</option>
            <option value="duty_manager">Duty Manager</option>
            <option value="station_manager">Station Manager</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">
            Link to Employee (optional, recommended for Agents/Supervisors)
          </label>
          <select
            className="border rounded w-full px-2 py-1"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">— No employee profile linked —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name || "Unnamed"}{" "}
                {emp.airline || emp.department
                  ? `· ${emp.airline || ""} ${emp.department || ""}`
                  : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            For Agents and Supervisors, linking to an employee profile lets them
            see only their own schedule in <b>My Schedule</b>.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white w-full py-2 rounded font-semibold disabled:opacity-70"
        >
          {loading ? "Saving..." : "Create User"}
        </button>

        {message && (
          <p className="text-sm text-center mt-2">
            {message.includes("successfully") ? (
              <span className="text-green-600">{message}</span>
            ) : (
              <span className="text-red-600">{message}</span>
            )}
          </p>
        )}
      </form>
    </div>
  );
}
