import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function ActivateEmailPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const activate = async (event) => {
    event.preventDefault();
    if (password.length < 12 || password !== confirm) {
      setMessage("Password must have at least 12 characters and match confirmation.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/.netlify/functions/employee-email-invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", userId: params.get("userId"), token: params.get("token"), password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Activation failed");
      setDone(true);
      setPassword(""); setConfirm("");
      setMessage("Your account is activated. You can now sign in with your new email.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <main style={{ maxWidth: 460, margin: "8vh auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
    <h1>AeroStation Hub</h1><h2>Activate email login</h2>
    <p>Set a new password to complete the invitation from your Station Manager.</p>
    {!done && <form onSubmit={activate} style={{ display: "grid", gap: 14 }}>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} style={{ display: "block", width: "100%", padding: 12 }} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={e => setConfirm(e.target.value)} style={{ display: "block", width: "100%", padding: 12 }} /></label>
      <button disabled={busy || !params.get("token") || !params.get("userId")} style={{ padding: 14 }}>{busy ? "Activating..." : "Activate account"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    <Link to="/login">Return to login</Link>
  </main>;
}
