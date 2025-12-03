// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  // Mensaje principal (dashboard/main)
  const [mainMessage, setMainMessage] = useState("");
  const [mainMeta, setMainMeta] = useState(null);

  // Eventos
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Avisos / invitaciones
  const [notices, setNotices] = useState([]);
  const [loadingNotices, setLoadingNotices] = useState(false);

  // Empleados no disponibles / bloqueados
  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Schedules pendientes
  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // --- CARGAS DESDE FIRESTORE ---

  // Mensaje principal
  const fetchMainMessage = async () => {
    try {
      const ref = doc(db, "dashboard", "main");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setMainMessage(data.message || "");
        setMainMeta({
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null,
        });
      } else {
        setMainMessage("");
        setMainMeta(null);
      }
    } catch (err) {
      console.error("Error loading main dashboard message:", err);
    }
  };

  // Eventos (próximos, ordenados por fecha)
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const colRef = collection(db, "dashboard_events");
      const snap = await getDocs(colRef);

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => !e.date || e.date >= today)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 5); // primeros 5

      setEvents(items);
    } catch (err) {
      console.error("Error loading events:", err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Avisos / invitaciones
  const fetchNotices = async () => {
    setLoadingNotices(true);
    try {
      const colRef = collection(db, "dashboard_notices");
      const snap = await getDocs(colRef);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime; // más reciente primero
        })
        .slice(0, 5);

      setNotices(items);
    } catch (err) {
      console.error("Error loading notices:", err);
    } finally {
      setLoadingNotices(false);
    }
  };

  // Empleados bloqueados / no disponibles (ya tienes módulo de blocked)
  const fetchBlockedEmployees = async () => {
    setLoadingBlocked(true);
    try {
      const colRef = collection(db, "blockedEmployees");
      const snap = await getDocs(colRef);

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Si tus bloqueos tienen fechas (ej: from / to), aquí podrías filtrar
      // para "próxima semana". Por ahora mostramos todos los bloqueados.
      setBlockedEmployees(items);
    } catch (err) {
      console.error("Error loading blocked employees:", err);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // Schedules pendientes de aprobación
  const fetchPendingSchedules = async () => {
    setLoadingPending(true);
    try {
      const qPending = query(
        collection(db, "schedules"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(qPending);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

      setPendingSchedules(items);
    } catch (err) {
      console.error("Error loading pending schedules:", err);
    } finally {
      setLoadingPending(false);
    }
  };

  // Cargar todo al entrar al dashboard
  const reloadAll = () => {
    fetchMainMessage();
    fetchEvents();
    fetchNotices();
    fetchBlockedEmployees();
    fetchPendingSchedules();
  };

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // --- RENDER ---

  const pendingCount = pendingSchedules.length;
  const eventsCount = events.length;
  const blockedCount = blockedEmployees.length;

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600">
            Welcome, <b>{user?.username}</b>{" "}
            {user?.role && <span>({user.role})</span>}
          </p>
        </div>

        <button className="btn btn-soft text-xs" onClick={reloadAll}>
          ⟳ Refresh
        </button>
      </div>

      {/* MENSAJE PRINCIPAL DEL STATION MANAGER */}
      <div className="card text-sm">
        <div className="card-header">
          <h2 className="card-title">Station Manager Message</h2>
        </div>
        {mainMessage ? (
          <>
            <p className="whitespace-pre-wrap text-gray-700">{mainMessage}</p>
            {mainMeta && (
              <p className="text-[11px] text-gray-500 mt-2">
                Last update:{" "}
                {mainMeta.updatedAt
                  ? mainMeta.updatedAt
                  : "—"}{" "}
                {mainMeta.updatedBy ? `• by ${mainMeta.updatedBy}` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-sm">
            No message configured yet. Station Manager can set it in the
            Dashboard Editor.
          </p>
        )}
      </div>

      {/* RESUMEN RÁPIDO (CARDS) */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card text-sm">
          <div className="card-header">
            <span className="card-title">Pending Schedules</span>
          </div>
          <p className="text-2xl font-bold">{pendingCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            Schedules waiting for Station Manager approval.
          </p>
          {user?.role === "station_manager" && (
            <button
              className="btn btn-primary text-xs mt-2"
              onClick={() => navigate("/approvals")}
            >
              Go to Approvals
            </button>
          )}
        </div>

        <div className="card text-sm">
          <div className="card-header">
            <span className="card-title">Upcoming Events</span>
          </div>
          <p className="text-2xl font-bold">{eventsCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            Trainings, meetings or ops events coming up.
          </p>
        </div>

        <div className="card text-sm">
          <div className="card-header">
            <span className="card-title">Employees Unavailable</span>
          </div>
          <p className="text-2xl font-bold">{blockedCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            Employees blocked / not available for scheduling.
          </p>
          {user?.role === "station_manager" && (
            <button
              className="btn text-xs mt-2"
              onClick={() => navigate("/blocked")}
            >
              View Blocked Employees
            </button>
          )}
        </div>
      </div>

      {/* LISTA DE EVENTOS */}
      <div className="card text-sm">
        <div className="card-header">
          <h2 className="card-title">Events</h2>
        </div>
        {loadingEvents ? (
          <p className="text-gray-600">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No events added yet. Station Manager can add them in Dashboard
            Editor.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.id} className="border-b last:border-b-0 pb-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{ev.title}</span>
                  <span className="text-xs text-gray-500">
                    {ev.date}
                    {ev.time ? ` • ${ev.time}` : ""}
                  </span>
                </div>
                {ev.details && (
                  <p className="text-xs text-gray-700 mt-1">{ev.details}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* EMPLEADOS BLOQUEADOS / FUERA */}
      <div className="card text-sm">
        <div className="card-header">
          <h2 className="card-title">Employees Not Available</h2>
        </div>
        {loadingBlocked ? (
          <p className="text-gray-600">Loading employees…</p>
        ) : blockedEmployees.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No blocked employees registered.
          </p>
        ) : (
          <ul className="space-y-1">
            {blockedEmployees.map((emp) => (
              <li
                key={emp.id}
                className="flex justify-between items-center border-b last:border-b-0 py-1"
              >
                <div>
                  <span className="font-semibold text-sm">
                    {emp.name || emp.employeeName || "Employee"}
                  </span>
                  {emp.reason && (
                    <span className="text-xs text-gray-500 ml-2">
                      • {emp.reason}
                    </span>
                  )}
                </div>
                {/* si tienes campos from/to, los puedes mostrar aquí */}
                {(emp.from || emp.startDate || emp.until || emp.endDate) && (
                  <span className="text-xs text-gray-500">
                    {emp.from || emp.startDate || ""}{" "}
                    {emp.until || emp.endDate
                      ? `→ ${emp.until || emp.endDate}`
                      : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AVISOS / INVITACIONES */}
      <div className="card text-sm">
        <div className="card-header">
          <h2 className="card-title">Notices & Invitations</h2>
        </div>
        {loadingNotices ? (
          <p className="text-gray-600">Loading notices…</p>
        ) : notices.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No notices yet. Station Manager can add them in Dashboard Editor.
          </p>
        ) : (
          <ul className="space-y-2">
            {notices.map((n) => (
              <li
                key={n.id}
                className="border-b last:border-b-0 pb-2 flex flex-col gap-1"
              >
                <span className="font-semibold text-sm">{n.title}</span>
                {n.body && (
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">
                    {n.body}
                  </p>
                )}
                {n.link && (
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Open link
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
