// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useUser();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    if (!username || !pin) {
      setError("Please enter username and PIN.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("username", "==", username),
        where("pin", "==", pin)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Invalid credentials.");
        return;
      }

      const userData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      setUser(userData);

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Login error. Try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1950&q=80')",
      }}
    >
      {/* GLASS CARD */}
      <div className="bg-white/70 backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-80 border border-white/40">
        
        {/* Logo opcional */}
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          TPA Ops Portal
        </h1>
        <p className="text-xs text-center text-gray-600 mb-4">
          Crew Scheduling System
        </p>

        {/* Username */}
        <label className="text-sm font-medium">User</label>
        <input
          type="text"
          className="border w-full p-2 rounded mb-3 text-sm"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        {/* PIN */}
        <label className="text-sm font-medium">PIN</label>
        <input
          type="password"
          className="border w-full p-2 rounded mb-4 text-sm"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {/* Error */}
        {error && (
          <p className="text-red-600 text-xs mb-3 text-center">{error}</p>
        )}

        {/* LOGIN BUTTON */}
        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded shadow-md transition"
          onClick={handleLogin}
        >
          Login
        </button>
      </div>
    </div>
  );
}
