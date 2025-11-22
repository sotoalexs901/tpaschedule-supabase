import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EditUsersPage() {
  const { user } = useUser();

  // Solo station_manager puede entrar
  if (!user || user.role !== "station_manager") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Access denied — Only Station Managers can edit users.
        </h1>
      </div>
    );
  }

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }
    load();
  }, []);

  const updateUser = async (u) => {
    setSavingId(u.id);
    await updateDoc(doc(db, "users", u.id), {
      username: u.username,
      pin: u.pin,
      role: u.role,
    });
    setSavingId(null);
    alert("User updated!");
  };

  const deleteUser = async (id) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    await deleteDoc(doc(db, "users", id));
    setUsers((prev) => prev.filter((u) => u.id !== id));
    alert("User deleted.");
  };

  const resetPin = async (id) => {
    if (!confirm("Reset PIN to 0000?")) return;

    await updateDoc(doc(db, "users", id), { pin: "0000" });

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, pin: "0000" } : u))
    );

    alert("PIN reset to 0000.");
  };

  const handleChange = (id, field, value) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u))
    );
  };

  if (loading) return <p className="p-6">Loading users...</p>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Manage Users</h1>

      <div className="card p-4 overflow-auto">
        <table className="table text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th>Username</th>
              <th>PIN</th>
              <th>Role</th>
              <th className="text-center">Save</th>
              <th className="text-center">Reset PIN</th>
              <th className="text-center text-red-600">Delete</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <input
                    className="border px-2 py-1 w-full"
                    value={u.username}
                    onChange={(e) =>
                      handleChange(u.id, "username", e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    type="password"
                    className="border px-2 py-1 w-full"
                    value={u.pin}
                    onChange={(e) => handleChange(u.id, "pin", e.target.value)}
                  />
                </td>

                <td>
                  <select
                    className="border px-2 py-1 w-full"
                    value={u.role}
                    onChange={(e) => handleChange(u.id, "role", e.target.value)}
                  >
                    <option value="agent">Agent</option>
                    <option value="duty_manager">Duty Manager</option>
                    <option value="station_manager">Station Manager</option>
                  </select>
                </td>

                {/* SAVE */}
                <td className="text-center">
                  <button
                    onClick={() => updateUser(u)}
                    className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
                    disabled={savingId === u.id}
                  >
                    {savingId === u.id ? "Saving…" : "Save"}
                  </button>
                </td>

                {/* RESET PIN */}
                <td className="text-center">
                  <button
                    onClick={() => resetPin(u.id)}
                    className="bg-yellow-500 text-white px-3 py-1 rounded"
                  >
                    Reset
                  </button>
                </td>

                {/* DELETE */}
                <td className="text-center">
                  <button
                    onClick={() => deleteUser(u.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
