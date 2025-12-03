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

  // Empleados (para poder mostrar nombre en bloqueados)
  const [employees, setEmployees] = useState([]);

  // Empleados no disponibles / bloqueados (desde 'restrictions')
  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Schedules pendientes
  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // --- HELPERS ---

  const nameFor = (id) =>
    employees.find((e) => e.id === id)?.name || id;

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

  // Empleados (para nombres)
  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading employees:", err);
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
        .slice(0, 5);

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

  // Empleados bloqueados / no disponibles (tabla 'restrictions')
  const fetchBlockedEmployees = async () => {
    setLoadingBlocked(true);
    try {
      const colRef = collection(db, "restrictions");
      const snap = await getDocs(colRef);

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    fetchEmployees();
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Welcome back, {user?.username || "Station Manager"} 👋
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Here's a quick overview of what's happening this week.
          </p>
          {mainMeta?.updatedAt && (
            <p className="text-[11px] text-gray-500 mt-1">
              Last update: {mainMeta.updatedAt}{" "}
              {mainMeta.updatedBy && `• by ${mainMeta.updatedBy}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={reloadAll}
          className="px-3 py-1.5 text-xs rounded-full bg-white/80 border border-indigo-200 shadow-sm text-indigo-700 hover:bg-white"
        >
          ⟳ Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* MENSAJE PRINCIPAL */}
        <div className="md:col-span-3 bg-white/80 backdrop-blur-lg p-5 rounded-2xl shadow-md border border-white/60">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            📢 Manager Message
          </h2>
          <p className="text-gray-700 text-sm whitespace-pre-line">
            {mainMessage || "No message posted yet."}
          </p>
        </div>

        {/* SCHEDULES PENDIENTES */}
        <div className="md:col-span-3 bg-white/80 backdrop-blur-lg p-5 rounded-2xl shadow-md border border-white/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              ✅ Pending Schedules for Approval
            </h2>
            {loadingPending && (
              <span className="text-[11px] text-gray-500">Loading...</span>
            )}
          </div>

          {pendingSchedules.length === 0 && !loadingPending && (
            <p className="text-gray-500 text-sm">
              No schedules pending approval.
            </p>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            {pendingSchedules.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/70 text-xs cursor-pointer hover:bg-indigo-100 transition"
                onClick={() => navigate(`/approvals`)}
              >
                <p className="font-semibold text-indigo-800">
                  {s.airline} — {s.department}
                </p>
                <p className="text-[11px] text-gray-700 mt-1">
                  Week:{" "}
                  {s.days
                    ? Object.values(s.days)
                        .filter(Boolean)
                        .join(" / ")
                    : "N/A"}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Submitted by: {s.createdBy || "Duty Manager"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* EVENTS */}
        <div className="bg-white/80 backdrop-blur-lg p-5 rounded-2xl shadow-md border border-white/60">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            📅 Upcoming Events
          </h2>

          {loadingEvents && (
            <p className="text-gray-500 text-sm">Loading events...</p>
          )}

          {!loadingEvents && events.length === 0 && (
            <p className="text-gray-500 text-sm">No events scheduled.</p>
          )}

          <div className="space-y-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="p-3 bg-blue-50 rounded-lg border border-blue-100"
              >
                <p className="font-semibold text-blue-800">{ev.title}</p>
                <p className="text-xs text-gray-600">
                  {ev.date} {ev.time ? `• ${ev.time}` : ""}
                </p>
                {ev.details && (
                  <p className="text-xs mt-1 text-gray-700">{ev.details}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* NOTICES */}
        <div className="bg-white/80 backdrop-blur-lg p-5 rounded-2xl shadow-md border border-white/60">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            📌 Notices / Invitations
          </h2>

          {loadingNotices && (
            <p className="text-gray-500 text-sm">Loading notices...</p>
          )}

          {!loadingNotices && notices.length === 0 && (
            <p className="text-gray-500 text-sm">No notices posted.</p>
          )}

          <div className="space-y-3">
            {notices.map((n) => (
              <div
                key={n.id}
                className="p-3 bg-yellow-50 rounded-lg border border-yellow-100"
              >
                <p className="font-semibold text-yellow-800">{n.title}</p>
                {n.body && <p className="text-xs mt-1">{n.body}</p>}
                {n.link && (
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-700 underline mt-1 block"
                  >
                    View more →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* BLOCKED EMPLOYEES */}
        <div className="bg-white/80 backdrop-blur-lg p-5 rounded-2xl shadow-md border border-white/60">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            🚫 Employees Not Available
          </h2>

          {loadingBlocked && (
            <p className="text-gray-500 text-sm">Loading blocked employees...</p>
          )}

          {!loadingBlocked && blockedEmployees.length === 0 && (
            <p className="text-gray-500 text-sm">
              No employees blocked at the moment.
            </p>
          )}

          <div className="space-y-3">
            {blockedEmployees.map((b) => (
              <div
                key={b.id}
                className="p-3 bg-red-50 rounded-lg border border-red-100"
              >
                <p className="font-semibold text-red-800">
                  {nameFor(b.employeeId)}
                </p>
                <p className="text-xs text-gray-700">{b.reason}</p>
                <p className="text-[11px] text-gray-500">
                  {b.start_date || "N/A"} → {b.end_date || "N/A"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
