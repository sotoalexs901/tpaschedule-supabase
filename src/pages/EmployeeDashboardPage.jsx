// src/pages/EmployeeDashboardPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔔 Cargamos anuncios/eventos para empleados
  // Colección en Firestore: "employeeAnnouncements"
  useEffect(() => {
    async function loadAnnouncements() {
      try {
        const q = query(
          collection(db, "employeeAnnouncements"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAnnouncements(list);
      } catch (err) {
        console.error("Error loading employee announcements:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements();
  }, []);

  const goTo = (path) => navigate(path);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-sm text-slate-600">
          {user?.username} · {user?.role}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          This is your crew dashboard. Check your schedule, request time off,
          and stay updated with the latest station news.
        </p>
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* My Schedule */}
        <button
          type="button"
          onClick={() => goTo("/my-schedule")}
          className="card p-3 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            My Schedule
          </div>
          <div className="text-sm font-semibold mt-1">
            View my weekly schedules
          </div>
          <p className="text-xs text-slate-500 mt-1">
            See all approved schedules where you appear.
          </p>
        </button>

        {/* Request Day Off / PTO (versión interna ligada al usuario) */}
        <button
          type="button"
          onClick={() => goTo("/request-dayoff-internal")}
          className="card p-3 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Request Day Off / PTO
          </div>
          <div className="text-sm font-semibold mt-1">
            Send a new request
          </div>
          <p className="text-xs text-slate-500 mt-1">
            This request will be linked to your employee profile.
          </p>
        </button>

        {/* Status Day Off / PTO (solo sus solicitudes) */}
        <button
          type="button"
          onClick={() => goTo("/dayoff-status-internal")}
          className="card p-3 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Day Off / PTO Status
          </div>
          <div className="text-sm font-semibold mt-1">
            Track my requests
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Check if your requests are pending, approved, or returned.
          </p>
        </button>
      </div>

      {/* Eventos / Anuncios */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Station News & Events
        </h2>

        {loading && (
          <div className="card p-3 text-sm text-slate-500">
            Loading announcements...
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="card p-3 text-sm text-slate-500">
            No announcements yet. Stay tuned.
          </div>
        )}

        {!loading &&
          announcements.map((item) => (
            <div key={item.id} className="card p-3 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {item.title || "Announcement"}
                </h3>
                {item.createdAt?.toDate && (
                  <span className="text-[10px] text-slate-500">
                    {item.createdAt.toDate().toLocaleDateString()}
                  </span>
                )}
              </div>
              {item.subtitle && (
                <p className="text-xs text-slate-500">{item.subtitle}</p>
              )}
              {item.body && (
                <p className="text-xs text-slate-600 whitespace-pre-line mt-1">
                  {item.body}
                </p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
