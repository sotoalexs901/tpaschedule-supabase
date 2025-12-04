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

  // Empleados no disponibles / bloqueados
  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Schedules pendientes
  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Fotos / highlights del dashboard
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // --------- CARGAS DESDE FIRESTORE --------- //

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

  // Empleados bloqueados / no disponibles (colección 'restrictions')
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

  // Fotos (dashboard_photos)
  const fetchPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const colRef = collection(db, "dashboard_photos");
      const snap = await getDocs(colRef);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

      setPhotos(items);
    } catch (err) {
      console.error("Error loading dashboard photos:", err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  // Cargar todo al entrar al dashboard
  const reloadAll = () => {
    fetchMainMessage();
    fetchEvents();
    fetchNotices();
    fetchBlockedEmployees();
    fetchPendingSchedules();
    fetchPhotos();
  };

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // --------- RENDER --------- //
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* HEADER */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            Welcome back, {user?.username || "Station Manager"} 👋
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Here&apos;s a quick overview of what&apos;s happening this week.
          </p>
        </div>

        <button
          type="button"
          onClick={reloadAll}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800"
        >
          Refresh dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* MESSAGE CARD */}
        <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
            <span role="img" aria-label="message">
              📢
            </span>
            Station Manager Message
          </h2>
          <p className="text-sm text-slate-800 whitespace-pre-line">
            {mainMessage || "No message posted yet."}
          </p>
          {mainMeta?.updatedAt && (
            <p className="text-[11px] text-slate-500 mt-2">
              Last update: {mainMeta.updatedAt}{" "}
              {mainMeta.updatedBy ? `• by ${mainMeta.updatedBy}` : ""}
            </p>
          )}
        </div>

        {/* STATION HIGHLIGHTS (FOTOS) */}
        <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span role="img" aria-label="highlights">
                ✈️
              </span>
              Station Highlights
            </h2>
            {photos.length > 0 && (
              <span className="text-[11px] text-slate-500">
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loadingPhotos ? (
            <p className="text-sm text-slate-400">Loading photos...</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-slate-500">
              No station highlights yet. Upload photos from Dashboard Editor.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shadow-xs"
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={p.url}
                      alt={p.caption || "Station highlight"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {p.caption && (
                    <p className="text-[11px] text-slate-600 px-2 py-1 truncate">
                      {p.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* UPCOMING EVENTS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <span role="img" aria-label="events">
              📅
            </span>
            Upcoming Events
          </h2>

          {loadingEvents ? (
            <p className="text-sm text-slate-400">Loading events...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-500">No events scheduled.</p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 bg-sky-50 rounded-lg border border-sky-100"
                >
                  <p className="font-semibold text-sky-900 text-sm">
                    {ev.title}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {ev.date} {ev.time ? `• ${ev.time}` : ""}
                  </p>
                  {ev.details && (
                    <p className="text-xs mt-1 text-slate-700">
                      {ev.details}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NOTICES / INVITATIONS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <span role="img" aria-label="notices">
              📌
            </span>
            Notices / Invitations
          </h2>

          {loadingNotices ? (
            <p className="text-sm text-slate-400">Loading notices...</p>
          ) : notices.length === 0 ? (
            <p className="text-sm text-slate-500">No notices posted.</p>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <div
                  key={n.id}
                  className="p-3 bg-amber-50 rounded-lg border border-amber-100"
                >
                  <p className="font-semibold text-amber-900 text-sm">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs mt-1 text-slate-800">{n.body}</p>
                  )}
                  {n.link && (
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-700 underline mt-1 block"
                    >
                      View more →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EMPLOYEES NOT AVAILABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <span role="img" aria-label="blocked">
              🚫
            </span>
            Employees Not Available
          </h2>

          {loadingBlocked ? (
            <p className="text-sm text-slate-400">Loading employees...</p>
          ) : blockedEmployees.length === 0 ? (
            <p className="text-sm text-slate-500">No employees blocked.</p>
          ) : (
            <div className="space-y-3">
              {blockedEmployees.map((b) => (
                <div
                  key={b.id}
                  className="p-3 bg-rose-50 rounded-lg border border-rose-100"
                >
                  <p className="font-semibold text-rose-900 text-sm">
                    {b.employeeName || b.name || b.employeeId}
                  </p>
                  <p className="text-xs text-slate-700">{b.reason}</p>
                  <p className="text-[11px] text-slate-500">
                    {b.start_date || "N/A"} → {b.end_date || "N/A"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PENDING SCHEDULES (para Station Manager) */}
        <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span role="img" aria-label="pending">
                📥
              </span>
              Pending Schedules for Approval
            </h2>
            {user?.role === "station_manager" && (
              <button
                type="button"
                className="px-3 py-1 text-[11px] rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={() => navigate("/approvals")}
              >
                Go to Approvals
              </button>
            )}
          </div>

          {loadingPending ? (
            <p className="text-sm text-slate-400">Loading schedules...</p>
          ) : pendingSchedules.length === 0 ? (
            <p className="text-sm text-slate-500">
              No schedules waiting for approval.
            </p>
          ) : (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              {pendingSchedules.map((sch) => (
                <div
                  key={sch.id}
                  className="border border-slate-200 rounded-lg p-3 bg-slate-50"
                >
                  <p className="font-semibold text-slate-900">
                    {sch.airline} — {sch.department}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Total Hours:{" "}
                    {sch.airlineWeeklyHours
                      ? sch.airlineWeeklyHours.toFixed(2)
                      : "0.00"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Sent by: {sch.createdBy || "unknown"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
