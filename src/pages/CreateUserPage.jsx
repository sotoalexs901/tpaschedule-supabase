import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!username || !pin || !role) {
      setMessage("All fields are required.");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "users"), {
        username,
        pin,
        role,
        createdAt: serverTimestamp(),
      });

      setUsername("");
      setPin("");
      setRole("agent");

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
            <option value="duty_manager">Duty Manager</option>
            <option value="station_manager">Station Manager</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white w-full py-2 rounded font-semibold"
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
