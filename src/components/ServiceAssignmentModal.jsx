// src/components/ServiceAssignmentModal.jsx
// ADDITIVE UI COMPONENT - not connected to Firebase by itself.
import React, { useState } from "react";

const clean = (value) => String(value ?? "").trim();

/**
 * Required props:
 * assignment: { id, type: 'WCHR'|'UMNR', wheelchairNumber?, serviceNumber?, flightNumber?, pickupLocation?, status? }
 * onAccept(assignment): Promise<void>
 * onReject(assignment, reason): Promise<void>
 * onStart(assignment): Promise<void>
 * onDetails(assignment): void
 * busy?: boolean
 * error?: string
 *
 * IMPORTANT: Parent must enforce identity/authorization and verify server-side state.
 * Modal never writes to Firestore or changes a WCHR journey automatically.
 */
export default function ServiceAssignmentModal({
  assignment,
  onAccept,
  onReject,
  onStart,
  onDetails,
  busy = false,
  error = "",
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");
  if (!assignment) return null;

  const type = clean(assignment.type).toUpperCase() === "UMNR" ? "UMNR" : "WCHR";
  const accepted = clean(assignment.status).toUpperCase() === "ACCEPTED";
  const identifier = type === "WCHR"
    ? `WCHR #${clean(assignment.wheelchairNumber) || "Pending"}`
    : `UMNR ${clean(assignment.serviceNumber) || "Assignment"}`;

  async function reject() {
    if (reason.trim().length < 5) {
      setLocalError("Please provide a reason (at least 5 characters).");
      return;
    }
    setLocalError("");
    await onReject?.(assignment, reason.trim());
  }

  const button = { width: "100%", minHeight: 48, padding: "12px 16px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: busy ? "wait" : "pointer" };
  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(7,15,30,.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="service-assignment-title" style={{ background: "#fff", color: "#14233a", borderRadius: 20, width: "100%", maxWidth: 440, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.35)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 1, color: type === "UMNR" ? "#8a4a00" : "#1556a2" }}>NEW {type} ASSIGNMENT</div>
        <div aria-hidden="true" style={{ textAlign: "center", fontSize: 72, margin: "12px 0" }}>{type === "UMNR" ? "🧒" : "♿"}</div>
        <h2 id="service-assignment-title" style={{ fontSize: 30, textAlign: "center", margin: "4px 0 12px" }}>{identifier}</h2>
        <p style={{ textAlign: "center", margin: "0 0 18px" }}>{accepted ? "Assignment accepted. Ready to start pickup?" : "Dispatch has assigned you a new service. Please respond."}</p>
        <div style={{ background: "#f2f5f9", borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gap: 8 }}>
          <div><strong>Pickup:</strong> {clean(assignment.pickupLocation) || "See service details"}</div>
          <div><strong>Flight:</strong> {clean(assignment.flightNumber) || "See service details"}</div>
        </div>
        {(error || localError) && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error || localError}</p>}
        {rejecting && !accepted ? (
          <div style={{ display: "grid", gap: 10 }}>
            <label htmlFor="assignment-rejection-reason" style={{ fontWeight: 700 }}>Why can't you take this assignment?</label>
            <textarea id="assignment-rejection-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #9ca3af" }} />
            <button type="button" disabled={busy || reason.trim().length < 5} onClick={reject} style={{ ...button, background: "#a32020", color: "white", border: 0 }}>Submit Rejection</button>
            <button type="button" disabled={busy} onClick={() => { setRejecting(false); setLocalError(""); }} style={{ ...button, background: "white", border: "1px solid #a5adba" }}>Back</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {accepted ? (
              <button type="button" disabled={busy} onClick={() => onStart?.(assignment)} style={{ ...button, background: "#17633d", color: "white", border: 0 }}>Start Pickup Journey</button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => onAccept?.(assignment)} style={{ ...button, background: "#17633d", color: "white", border: 0 }}>Accept Assignment</button>
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} style={{ ...button, background: "white", color: "#a32020", border: "1px solid #a32020" }}>I Can't Take This Assignment</button>
              </>
            )}
            <button type="button" disabled={busy} onClick={() => onDetails?.(assignment)} style={{ ...button, background: "#eef3fa", color: "#173b68", border: 0 }}>{type === "UMNR" ? "Minor Details" : "Passenger Details"}</button>
          </div>
        )}
      </section>
    </div>
  );
}
