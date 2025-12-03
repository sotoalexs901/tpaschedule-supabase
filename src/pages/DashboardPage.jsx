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

  const [absencesNextWeek, setAbsencesNextWeek] = useState([]);
  const [loadingAbsences, setLoadingAbsences] = useState(false);

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

  // 🗓 Obtener rango de la próxima semana (lunes–domingo)
  const getNextWeekRange = () => {
    const today = new Date();
    const day = today.getDay(); // 0=Sunday,1=Monday,...6=Saturday

    // cuántos días faltan para el próximo lunes
    let daysUntilNextMonday = (1 - day + 7) % 7;
    if (daysUntilNextMonday === 0) {
      daysUntilNextMonday = 7; // si hoy es lunes, próxima semana = siguiente lunes
    }

    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + daysUntilNextMonday,
      0,
      0,
      0,
      0
    );

    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 6,
      23,
      59,
      59,
      999
    );

    return { start, end };
  };

  // 👥 Cargar ausencias de la próxima semana desde `employeeAbsences`
  const fetchAbsencesNextWeek = async () => {
    setLoadingAbsences(true);
    try {
      const snap = await getDocs(collection(db, "employeeAbsences"));
      const { start, end } = getNextWeekRange();

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => {
          const startDate = item.startDate?.toDate
            ? item.startDate.toDate()
            : null;
          const endDate = item.endDate?.toDate ? item.endDate.toDate() : null;

          if (!startDate || !endDate) return false;

          // overlap con la próxima semana
          return startDate <= end && endDate >= start;
        })
        .sort((a, b) => {
          const aDate = a.startDate?.toDate
            ? a.startDate.toDate().getTime()
            : 0;
          const bDate = b.startDate?.toDate
            ? b.startDate.toDate().getTime()
            : 0;
          return aDate - bDate;
        });

      setAbsencesNextWeek(items);
    } catch (err) {
      console.error("Error loading employee absences:", err);
    } finally {
      setLoadingAbsences(false);
    }
  };

  useEffect(() => {
    fetchPending();
    fetchAbsencesNextWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 🔃 REFRESH (punto 3): refrescar toda la página
  const handleFullRefresh = () => {
    window.location.reload();
  };

  // Helper para formatear fecha corta
  const formatShortDate = (dateLike) => {
    if (!dateLike) return "";
    const d =
      dateLike instanceof Date
        ? dateLike
        : dateLike.toDate
        ? dateLike.toDate()
        : new Date(dateLike);

    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
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

        {/* Botón refresh de la página */}
        <button
          type="button"
          onClick={handleFullRefresh}
          className="btn btn-soft"
        >
          ⟳ Refresh
        </button>
      </div>

      {/* Tarjetas principales */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Info de usuario */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">User Info</span>
          </div>
          <p className="text-sm text-gray-600">
            Role: <b>{user?.role}</b>
          </p>
        </div>

        {/* Pending schedules – solo Station Manager */}
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
              <p className="text-sm text-gray-600">
                Loading pending schedules…
              </p>
            ) : (
              <>
                <p className="text-3xl font-bold">{pendingCount}</p>
                <p className="text-sm text-gray-600">
                  schedule{pendingCount === 1 ? "" : "s"} waiting for approval.
                </p>

                {pendingCount > 0 && (
                  <div className="mt-3 p-2 rounded-md bg-yellow-50 border border-yellow-300 text-sm">
                    ⚠️ You have <b>{pendingCount}</b> schedule
                    {pendingCount === 1 ? "" : "s"} pending approval.
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

        {/* NUEVO: Empleados fuera la próxima semana */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Next Week – Employees Off</span>
            <button
              type="button"
              onClick={fetchAbsencesNextWeek}
              className="btn btn-soft"
            >
              Reload
            </button>
          </div>

          {loadingAbsences ? (
            <p className="text-sm text-gray-600">Loading absences…</p>
          ) : absencesNextWeek.length === 0 ? (
            <p className="text-sm text-gray-600">
              No employees marked as off next week.
            </p>
          ) : (
            <ul className="text-sm text-gray-700 space-y-1 max-h-56 overflow-auto">
              {absencesNextWeek.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col border-b border-gray-100 pb-1 last:border-b-0"
                >
                  <span className="font-semibold">
                    {item.employeeName || "Unnamed"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.department || "Dept N/A"} •{" "}
                    {formatShortDate(item.startDate)} –{" "}
                    {formatShortDate(item.endDate)}
                    {item.reason ? ` • ${item.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-gray-500">
            Duty Managers should NOT schedule these employees for next week.
          </p>
        </div>
      </div>

      {/* Sección extra */}
      <div className="card text-sm">
        <h2 className="font-semibold mb-1">Quick tips</h2>
        <ul className="list-disc pl-5 text-gray-600">
          <li>Use "Create Schedule" to send new weekly schedules.</li>
          <li>
            Duty Managers can check “Approved Schedules” to see which schedules
            are ready.
          </li>
          <li>
            Station Managers see pending schedules and next-week absences here
            in the dashboard.
          </li>
        </ul>
      </div>
    </div>
  );
}
