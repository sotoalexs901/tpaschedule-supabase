import React, { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css"; // 🎨 archivo extra opcional para estilo premium

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
      setError("Enter user and PIN");
      return;
    }

    const q = query(
      collection(db, "users"),
      where("username", "==", username),
      where("pin", "==", pin)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      setError("Invalid user or PIN");
      return;
    }

    const doc = snap.docs[0];
    const data = doc.data();

    setUser({ id: doc.id, username: data.username, role: data.role });
    navigate("/dashboard");
  };

  return (
    <div className="login-container">

      {/* PANEL IZQUIERDO (BACKGROUND) */}
      <div className="login-left"></div>

      {/* PANEL DERECHO (FORMULARIO) */}
      <div className="login-right">
        <form className="login-box" onSubmit={handleLogin}>
          
          <h1 className="login-title">TPA Ops Portal</h1>
          <p className="login-subtitle">Crew Scheduling & Management</p>

          <div className="login-field">
            <label>User</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Username"
            />
          </div>

          <div className="login-field">
            <label>PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="login-button" type="submit">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
