import React, { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const { setUser } = useUser();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!username || !pin) {
      setError("Enter username and PIN");
      return;
    }

    const q = query(
      collection(db, "users"),
      where("username", "==", username),
      where("pin", "==", pin)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      setError("Invalid credentials");
      return;
    }

    const doc = snap.docs[0];
    const data = doc.data();

    setUser({ id: doc.id, username: data.username, role: data.role });
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="bg-white p-8 rounded shadow-md w-80">

        <h1 className="text-xl font-bold text-center mb-2 text-[#0A2342]">
          TPA Ops Portal
        </h1>
        <p className="text-center text-sm text-gray-500 mb-4">
          Crew Scheduling System
        </p>

        <form onSubmit={handleLogin} className="space-y-3">

          <div>
            <label className="text-sm font-medium">User</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border rounded mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full p-2 border rounded mt-1"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-blue-700 text-white p-2 rounded hover:bg-blue-800 mt-2"
          >
            Login
          </button>

        </form>
      </div>
    </div>
  );
}
