// src/pages/TimeOffStatusPublicPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffStatusPublicPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Cargar empleados
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for status page:", err);
      }
    }
    loadEmployees().catch(console.error);
  }, []);

  const handleCheck = async (e) => {
    e.preventDefault();
    setMessage("");
    setRequests([]);

    if (!employeeId || pin.length !== 4) {
      setMessage("Please select your name and enter your 4-digit PIN.");
      return;
    }

    try {
      setLoading(true);

      // 🔁 SIN orderBy, para evitar índice obligatorio y errores de carga
      const qReq = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId),
        where("pin", "==", pin)
      );

      const snap = await getDocs(qReq);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Ordenamos en el cliente por fecha (si existe)
      list.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      if (list.length === 0) {
        setMessage("No requests found for this employee and PIN.");
      } else {
        setRequests(list);
      }
    } catch (err) {
      console.error("Error checking time off status:", err);
      setMessage("Error loading status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    if (status === "approved") return "😊";
    if (status === "rejected") return "😞";
    if (status === "needs_info") return "📝";
    return "";
  };

  const getStatusLabel = (status) => {
    if (status === "approved") return "APPROVED";
    if (status === "rejected") return "REJECTED";
    if (status === "needs_info") return "MORE INFO NEEDED";
    return (status || "").toUpperCase();
  };

  const getStatusColor = (status) => {
    if (status === "approved") return "#bbf7d0";
    if (status === "rejected") return "#fecaca";
    if (status === "needs_info") return "#fed7aa";
    return "#e5e7eb";
  };

  // Estilos reusados (igual que en la página de request)
  const outerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: "url('/tpa-flamingo-bw.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  const cardStyle = {
    background: "rgba(15,23,42,0.88)",
    backdropFilter: "blur(10px)",
    borderRadius: "18px",
    boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
    border: "1px solid rgba(148,163,184,0.45)",
    padding: "24px 28px",
    width: "340px",
    maxWidth: "92vw",
    color: "#f9fafb",
  };

  const inputStyle = {
    width: "100%",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    padding: "7px 9px",
    fontSize: "0.85rem",
    color: "#0f172a",
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    marginBottom: "3px",
    display: "block",
  };

  const smallTextStyle = {
    fontSize: "11px",
    color: "#e5e7eb",
  };

  return (
    <div style={outerStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            textAlign: "center",
            marginBottom: "4px",
          }}
        >
          Check Day Off Request Status
        </h1>
        <p
          style={{
            ...smallTextStyle,
            textAlign: "center",
            marginBottom: "14px",
            color: "#cbd5f5",
          }}
        >
          Select your name, enter your 4-digit PIN, and view the status of your
          requests.
        </p>

        <form onSubmit={handleCheck} style={{ display: "grid", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Employee Name</label>
            <select
              style={inputStyle}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select your name</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>4-digit PIN</label>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              style={{ ...inputStyle, letterSpacing: "0.3em" }}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>

          <p style={{ ...smallTextStyle, marginTop: "2px" }}>
            HR and Management team may take up to <b>72 hours</b> to approve or
            reject your request.
          </p>

          {message && (
            <p
              style={{
                fontSize: "11px",
                textAlign: "center",
                color: "#fed7aa",
              }}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              background:
                "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
              borderRadius: "999px",
              border: "none",
              padding: "8px 0",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 12px 25px rgba(37,99,235,0.55)",
            }}
          >
            {loading ? "Checking..." : "Check Status"}
          </button>
        </form>

        {/* Resultados */}
        {requests.length > 0 && (
          <div
            style={{
              marginTop: "14px",
              borderTop: "1px solid rgba(148,163,184,0.5)",
              paddingTop: "10px",
              maxHeight: "190px",
              overflowY: "auto",
              fontSize: "11px",
            }}
          >
            {requests.map((r) => (
              <div key={r.id} style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "20px" }}>{getStatusIcon(r.status)}</span>
                  <div style={{ fontWeight: 600 }}>
                    {r.reasonType || "Reason"} — {r.startDate} → {r.endDate}
                  </div>
                </div>
                <div
                  style={{
                    color: getStatusColor(r.status),
                    fontWeight: 600,
                    marginTop: "2px",
                  }}
                >
                  Status: {getStatusLabel(r.status)}
                </div>
                {r.managerNote && (
                  <div style={{ marginTop: "3px", color: "#e5e7eb" }}>
                    <span style={{ fontWeight: 600 }}>
                      Message from Management:{" "}
                    </span>
                    <span>{r.managerNote}</span>
                  </div>
                )}
                {r.notes && (
                  <div style={{ marginTop: "2px", color: "#cbd5e1" }}>
                    <span style={{ fontWeight: 600 }}>Your notes: </span>
                    <span>{r.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
