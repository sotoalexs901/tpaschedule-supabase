// src/pages/TimeOffStatusPublicPage.jsx
import React, { useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffStatusPublicPage() {
  const [employeeName, setEmployeeName] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    setRequests([]);

    const name = employeeName.trim();
    if (!name) {
      setError("Please enter your full name.");
      return;
    }

    try {
      setLoading(true);

      // 🔍 Buscar por employeeName EXACTO
      const qReq = query(
        collection(db, "timeOffRequests"),
        where("employeeName", "==", name),
        // orderBy solo funciona si está indexado con where, así que
        // si da problemas puedes quitar orderBy
        // orderBy("createdAt", "desc")
      );

      const snap = await getDocs(qReq);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Ordenar en el cliente por fecha (más reciente primero)
      list.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      if (list.length === 0) {
        setError(
          "No requests found for that name. Check spelling or ask your manager."
        );
      }

      setRequests(list);
    } catch (err) {
      console.error("Error loading time off status:", err);
      setError("Error searching requests. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (status) => {
    if (!status) return "pending";
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return status[0].toUpperCase() + status.slice(1);
  };

  const statusColor = (status) => {
    if (status === "approved") return "#16a34a"; // green
    if (status === "rejected") return "#dc2626"; // red
    return "#ca8a04"; // amber (pending)
  };

  return (
    <div
      className="min-h-screen"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(to bottom right, #020617, #0f172a, #1e293b)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "rgba(15,23,42,0.92)",
          borderRadius: "1rem",
          padding: "1.5rem",
          color: "#e5e7eb",
          boxShadow: "0 20px 45px rgba(0,0,0,0.65)",
          border: "1px solid rgba(148,163,184,0.4)",
        }}
      >
        {/* Título */}
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "1.4rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#f9fafb",
            }}
          >
            TPA OPS SYSTEM
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.8rem",
              color: "#9ca3af",
            }}
          >
            Day Off Request Status
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSearch} style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
            }}
          >
            Employee Name (as submitted)
          </label>
          <input
            type="text"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            placeholder="e.g. John Doe"
            style={{
              width: "100%",
              padding: "0.45rem 0.55rem",
              borderRadius: "0.5rem",
              border: "1px solid #4b5563",
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
            }}
          />

          {error && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "#fecaca",
                background: "rgba(248,113,113,0.1)",
                borderRadius: "0.5rem",
                padding: "0.4rem 0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              borderRadius: "999px",
              border: "none",
              background: loading ? "#1d4ed8aa" : "#1d4ed8",
              color: "#f9fafb",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loading ? "Searching..." : "Check status"}
          </button>
        </form>

        {/* Resultados */}
        {requests.length > 0 && (
          <div
            style={{
              marginTop: "0.75rem",
              background: "rgba(15,23,42,0.85)",
              borderRadius: "0.75rem",
              padding: "0.75rem",
              border: "1px solid rgba(55,65,81,0.9)",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "#9ca3af",
                marginBottom: "0.5rem",
              }}
            >
              Showing last {requests.length} request
              {requests.length > 1 ? "s" : ""} for{" "}
              <span style={{ fontWeight: 600, color: "#e5e7eb" }}>
                {employeeName}
              </span>
              .
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {requests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    padding: "0.6rem 0.7rem",
                    borderRadius: "0.6rem",
                    background: "#020617",
                    border: "1px solid rgba(75,85,99,0.9)",
                    fontSize: "0.78rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#e5e7eb" }}>
                      {req.reasonType || "Time Off"}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: statusColor(req.status),
                        textTransform: "uppercase",
                        fontSize: "0.7rem",
                      }}
                    >
                      {formatStatus(req.status)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      color: "#e5e7eb",
                      fontSize: "0.78rem",
                    }}
                  >
                    {req.startDate} → {req.endDate}
                  </p>
                  {req.notes && (
                    <p
                      style={{
                        margin: "0.3rem 0 0",
                        color: "#9ca3af",
                        fontSize: "0.72rem",
                      }}
                    >
                      <strong>Notes:</strong> {req.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer pequeño */}
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.7rem",
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          If you see something incorrect, please contact your Duty or Station
          Manager.
        </p>
      </div>
    </div>
  );
}
