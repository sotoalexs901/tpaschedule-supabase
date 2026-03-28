import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useUser();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin) {
      setError("Please enter your username and PIN.");
      return;
    }

    try {
      setLoading(true);

      const q = query(
        collection(db, "users"),
        where("username", "==", cleanUsername)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Invalid username or PIN.");
        return;
      }

      const userDoc = snap.docs[0];
      const userData = { id: userDoc.id, ...userDoc.data() };

      if (String(userData.pin || "") !== cleanPin) {
        setError("Invalid username or PIN.");
        return;
      }

      setUser(userData);
      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      setError("There was a problem signing in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-overlay-content">
          <div className="login-overlay-tag">TPA OPS SYSTEM</div>

          <h1 className="login-overlay-title">
            Smarter scheduling,
            <br />
            cleaner operations.
          </h1>

          <p className="login-overlay-text">
            Manage schedules, communications, approvals, employee restrictions,
            budgets and operational updates from one modern platform built for
            station teams.
          </p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-icon">✈️</div>

            <div className="login-brand-text">
              <p className="login-brand-title">TPA OPS SYSTEM</p>
              <p className="login-brand-subtitle">
                Airline operations dashboard
              </p>
            </div>
          </div>

          <form className="login-box" onSubmit={handleLogin}>
            <h1 className="login-title">Welcome back</h1>

            <p className="login-subtitle">
              Sign in to continue to your scheduling and operations dashboard.
            </p>

            {error && <div className="login-error">{error}</div>}

            <div className="login-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="login-field">
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                type="password"
                placeholder="Enter your 4-digit PIN"
                value={pin}
                maxLength={4}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                autoComplete="current-password"
              />
            </div>

            <div className="login-row">
              <span className="login-helper-text">
                Access for station managers, supervisors and agents.
              </span>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="login-footer-note">
              Secure access to schedules, team updates, approvals and daily
              station operations.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
