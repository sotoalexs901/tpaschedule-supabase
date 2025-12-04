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

  // Fotos destacadas del dashboard
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

  // Fotos / highlights del dashboard
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              Welcome back, {user?.username || "Station Manager"} 👋
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Here&apos;s a quick overview of what&apos;s happening this week.
            </p>
          </div>

          <button
            type="button"
            onClick={reloadAll}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white/70 shadow-sm hover:bg-white transition"
          >
            Refresh dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* MESSAGE CARD */}
          <div className="md:col-span-3 bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 text-rose-500 text-xs">
                📣
              </span>
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
                Station Manager Message
              </h2>
            </div>

            <p className="text-slate-800 text-sm whitespace-pre-line leading-relaxed">
              {mainMessage || "No message posted yet."}
            </p>

            {mainMeta?.updatedAt && (
              <p className="text-[11px] text-slate-500 mt-3 border-t border-slate-100 pt-2">
                Last update: {mainMeta.updatedAt}{" "}
                {mainMeta.updatedBy ? `• by ${mainMeta.updatedBy}` : ""}
              </p>
            )}
          </div>

          {/* STATION HIGHLIGHTS / PHOTOS */}
          <div className="md:col-span-3 bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-sky-500 text-xs">
                  ✈️
                </span>
                <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
                  Station Highlights
                </h2>
              </div>
            </div>

            {loadingPhotos ? (
              <p className="text-slate-400 text-sm">Loading photos...</p>
            ) : photos.length === 0 ? (
              <p className="text-slate-500 text-sm">
                No highlights yet. Add some photos from the Dashboard Editor.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((p) => (
                  <figure
                    key={p.id}
                    className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition"
                  >
                    {p.url && (
                      <img
                        src={p.url}
                        alt={p.caption || "Highlight"}
                        className="w-full h-40 object-cover"
                      />
                    )}
                    <figcaption className="px-3 py-2">
                      <p className="text-xs font-medium text-slate-800 truncate">
                        {p.caption || "Highlight"}
                      </p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          {/* UPCOMING EVENTS */}
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-800 uppercase tracking-wide">
              📅 Upcoming Events
            </h2>

            {loadingEvents ? (
              <p className="text-slate-400 text-sm">Loading events...</p>
            ) : events.length === 0 ? (
              <p className="text-slate-500 text-sm">No events scheduled.</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 bg-sky-50/70 rounded-lg border border-sky-100"
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
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-800 uppercase tracking-wide">
              📌 Notices / Invitations
            </h2>

            {loadingNotices ? (
              <p className="text-slate-400 text-sm">Loading notices...</p>
            ) : notices.length === 0 ? (
              <p className="text-slate-500 text-sm">No notices posted.</p>
            ) : (
              <div className="space-y-3">
                {notices.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-amber-50/80 rounded-lg border border-amber-100"
                  >
                    <p className="font-semibold text-amber-900 text-sm">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs mt-1 text-slate-700">
                        {n.body}
                      </p>
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
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-800 uppercase tracking-wide">
              🚫 Employees Not Available
            </h2>

            {loadingBlocked ? (
              <p className="text-slate-400 text-sm">Loading employees...</p>
            ) : blockedEmployees.length === 0 ? (
              <p className="text-slate-500 text-sm">No employees blocked.</p>
            ) : (
              <div className="space-y-3">
                {blockedEmployees.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 bg-rose-50/80 rounded-lg border border-rose-100"
                  >
                    <p className="font-semibold text-rose-900 text-sm">
                      {b.employeeName || b.name || b.employeeId}
                    </p>
                    <p className="text-xs text-slate-700">{b.reason}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.start_date || "N/A"} → {b.end_date || "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PENDING SCHEDULES (para Station Manager) */}
          <div className="md:col-span-3 bg-white/90 backdrop-blur rounded-2xl shadow-md border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-800 uppercase tracking-wide">
                📥 Pending Schedules for Approval
              </h2>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 bg-slate-50 hover:bg-slate-100 transition"
                onClick={() => navigate("/approvals")}
              >
                Go to Approvals
              </button>
            </div>

            {loadingPending ? (
              <p className="text-slate-400 text-sm">Loading schedules...</p>
            ) : pendingSchedules.length === 0 ? (
              <p className="text-slate-500 text-sm">
                No schedules waiting for approval.
              </p>
            ) : (
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                {pendingSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="border border-slate-100 rounded-xl p-3 bg-slate-50/80 hover:bg-slate-100 transition"
                  >
                    <p className="font-semibold text-slate-800 text-sm">
                      {sch.airline} — {sch.department}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">
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
    </div>
  );
}
