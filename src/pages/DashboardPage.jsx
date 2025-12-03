// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [pendingCount, setPendingCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);

  // 🔄 Cargar cantidad de horarios pendientes SOLO para station_manager
  const fetchPending = async () => {
    if (!user || user.role !== "station_manager") return;

    setLoadingPending(true);
    try {
      const q = query(
        collection(db, "schedules"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      setPendingCount(snap.size);
    } catch (err) {
      console.error("Error loading pending schedules:", err);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 🔃 REFRESH (punto 3): refrescar toda la página
  const handleFullRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      {/* Header del dashboard */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">TPA Operations Dashboard</h1>
          <p className="text-sm text-gray-600">
            Welcome back, <b>{user?.username}</b>.
          </p>
        </div>

        {/* Botón refresh de la página (Punto 3) */}
        <button
          type="button"
          onClick={handleFullRefresh}
          className="btn btn-soft"
        >
          ⟳ Refresh
        </button>
      </div>

      {/* Tarjeta de resumen general */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">User Info</span>
          </div>
          <p className="text-sm text-gray-600">
            Role: <b>{user?.role}</b>
          </p>
        </div>

        {/* Solo Station Manager ve esta parte de approvals */}
        {user?.role === "station_manager" && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pending Schedules</span>
              <button
                type="button"
                onClick={fetchPending}
                className="btn btn-soft"
              >
                Reload
              </button>
            </div>

            {loadingPending ? (
              <p className="text-sm text-gray-600">Loading pending schedules…</p>
            ) : (
              <>
                <p className="text-3xl font-bold">
                  {pendingCount}
                </p>
                <p className="text-sm text-gray-600">
                  schedule{pendingCount === 1 ? "" : "s"} waiting for approval.
                </p>

                {/* ⚠️ Notificación visual si hay pendientes */}
                {pendingCount > 0 && (
                  <div className="mt-3 p-2 rounded-md bg-yellow-50 border border-yellow-300 text-sm">
                    ⚠️ You have{" "}
                    <b>{pendingCount}</b>{" "}
                    schedule{pendingCount === 1 ? "" : "s"} pending approval.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/approvals")}
                  className="mt-3 w-full bg-blue-600 text-white py-2 rounded text-sm"
                >
                  Go to Approvals
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sección extra por si quieres agregar más cosas al dashboard luego */}
      <div className="card text-sm">
        <h2 className="font-semibold mb-1">Quick tips</h2>
        <ul className="list-disc pl-5 text-gray-600">
          <li>Use "Create Schedule" to send new weekly schedules.</li>
          <li>
            Duty Managers can check “Approved Schedules” to see what’s ready to
            use.
          </li>
          <li>
            Station Managers see pending schedules here and in the Approvals
            section.
          </li>
        </ul>
      </div>
    </div>
  );
}
