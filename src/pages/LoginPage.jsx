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

    const cleanUsername = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin) {
      setError("Please enter username and PIN.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("username", "==", cleanUsername),
        where("pin", "==", cleanPin)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Invalid credentials.");
        return;
      }

      const userData = { id: snap.docs[0].id, ...snap.docs[0].data() };

      // Opcional: si usas un campo 'active' y quieres bloquear usuarios deshabilitados:
      // if (userData.active === false) {
      //   setError("This user is disabled. Please contact your manager.");
      //   return;
      // }

      setUser(userData);

      // 🔀 Siempre mandamos a /dashboard.
      // DashboardEntry (en main.jsx) se encarga de mostrar
      // EmployeeDashboardPage para agent/supervisor
      // y DashboardPage para managers.
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Login error. Try again.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div
      className="login-page"
      style={{
        // Asegúrate de que esta imagen exista en /public, por ejemplo: public/flamingo-tpa.jpg
        backgroundImage: "url('/flamingo-tpa.jpg')",
      }}
    >
      {/* capa oscura encima de la foto */}
      <div className="login-overlay" />

      <div className="login-content">
        <div className="login-card">
          <h1 className="login-title">TPA Ops Portal</h1>
          <p className="login-subtitle">Crew Scheduling System</p>

          {/* Username */}
          <div className="login-field">
            <label className="login-label">User</label>
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your user"
            />
          </div>

          {/* PIN */}
          <div className="login-field">
            <label className="login-label">PIN</label>
            <input
              type="password"
              className="login-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your PIN"
            />
          </div>

          {/* Error */}
          {error && (
            <p
              style={{
                color: "#fecaca",
                fontSize: "0.75rem",
                textAlign: "center",
                marginTop: "0.25rem",
                marginBottom: "0.5rem",
              }}
            >
              {error}
            </p>
          )}

          {/* LOGIN BUTTON */}
          <button className="login-button" onClick={handleLogin}>
            Login
          </button>

          <p className="login-footer">TPA Schedule System · Tampa, FL</p>
        </div>
      </div>
    </div>
  );
}

