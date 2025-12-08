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
  const [language, setLanguage] = useState("en"); // "en" | "es"

  const isSupervisor = user?.role === "supervisor";

  // Diccionario de textos EN / ES
  const copy = {
    en: {
      crewPortal: "Crew Portal",
      welcome: "Welcome,",
      roleAgent: "Crew Agent",
      roleSupervisor: "Supervisor",
      intro:
        "Manage your workday, requests, and stay updated with station news.",
      quickActions: {
        scheduleTitle: "My Schedule",
        scheduleSubtitle: "Weekly Hours",
        scheduleBody: "View your approved schedules and weekly assignments.",
        ptoTitle: "PTO & Day Off",
        ptoSubtitle: "Send Request",
        ptoBody: "Submit time-off requests directly to HR/Management.",
        statusTitle: "Request Status",
        statusSubtitle: "Track Status",
        statusBody: "See if your requests were approved, pending, or returned.",
      },
      bannerTitle: "New schedule experience coming soon",
      bannerBody:
        "We are improving how you see and access your schedules. Stay tuned for upcoming updates and features.",
      newsTitle: "Station News & Events",
      loading: "Loading announcements...",
      empty: "No announcements available.",
    },
    es: {
      crewPortal: "Portal de Tripulación",
      welcome: "Bienvenido(a),",
      roleAgent: "Agente de Rampa / TC",
      roleSupervisor: "Supervisor",
      intro:
        "Administra tu jornada, solicitudes y mantente al día con las noticias de la estación.",
      quickActions: {
        scheduleTitle: "Mi Horario",
        scheduleSubtitle: "Horas Semanales",
        scheduleBody:
          "Consulta tus horarios aprobados y asignaciones semanales.",
        ptoTitle: "PTO y Días Libres",
        ptoSubtitle: "Enviar Solicitud",
        ptoBody:
          "Envía tus solicitudes de tiempo libre directamente a HR/Management.",
        statusTitle: "Estatus de Solicitudes",
        statusSubtitle: "Ver Estatus",
        statusBody:
          "Revisa si tus solicitudes fueron aprobadas, pendientes o devueltas.",
      },
      bannerTitle: "¡Nuevos cambios en los horarios muy pronto!",
      bannerBody:
        "Estamos mejorando la manera en que ves y accedes a tus horarios. Mantente pendiente de las próximas actualizaciones y funciones.",
      newsTitle: "Noticias y Eventos de la Estación",
      loading: "Cargando anuncios...",
      empty: "No hay anuncios disponibles.",
    },
  };

  const t = copy[language];

  // 🔔 Cargar anuncios de Firestore
  useEffect(() => {
    async function loadAnnouncements() {
      try {
        const q = query(
          collection(db, "employeeAnnouncements"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAnnouncements(list);
      } catch (err) {
        console.error("Error loading employee announcements:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements().catch(console.error);
  }, []);

  const goTo = (path) => navigate(path);

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background: "radial-gradient(circle at top, #0a0f24 0%, #020617 70%)",
        color: "white",
        fontFamily: "Poppins, system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      {/* Top bar: idioma + info usuario */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-[0.25em]">
            {t.crewPortal}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-white drop-shadow-sm mt-1">
            {t.welcome} {user?.username}
          </h1>
          <p className="text-sm text-blue-300">
            {isSupervisor ? t.roleSupervisor : t.roleAgent}
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-xl leading-relaxed">
            {t.intro}
          </p>
        </div>

        {/* Selector de idioma */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-[11px] text-slate-400 uppercase tracking-wide mr-1">
            Language
          </span>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`px-3 py-1 text-xs rounded-full border backdrop-blur-md transition ${
              language === "en"
                ? "bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/40"
                : "bg-transparent text-slate-300 border-white/20 hover:bg-white/10"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage("es")}
            className={`px-3 py-1 text-xs rounded-full border backdrop-blur-md transition ${
              language === "es"
                ? "bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/40"
                : "bg-transparent text-slate-300 border-white/20 hover:bg-white/10"
            }`}
          >
            ES
          </button>
        </div>
      </div>

      {/* ✔ Banner de noticias de horarios */}
      <div className="mb-7 rounded-2xl bg-gradient-to-r from-sky-500/80 via-indigo-500/85 to-blue-700/85 border border-white/20 shadow-xl shadow-blue-900/50 px-4 py-3 md:px-6 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="text-xs md:text-[13px] uppercase tracking-[0.25em] text-blue-100/90">
            Schedule Update
          </p>
          <h2 className="text-sm md:text-base font-semibold text-white mt-1">
            {t.bannerTitle}
          </h2>
          <p className="text-[11px] md:text-xs text-blue-50 mt-1 max-w-2xl leading-relaxed">
            {t.bannerBody}
          </p>
        </div>
        <div className="text-xs text-blue-50 md:text-right opacity-90">
          ✨ Be on the loop
        </div>
      </div>

      {/* ✔ Acciones rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Card 1: My Schedule */}
        <div
          onClick={() => goTo("/my-schedule")}
          className="p-5 rounded-xl bg-[#0f172a]/70 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/40 hover:bg-[#1e293b]/70
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            {t.quickActions.scheduleTitle}
          </div>
          <div className="text-lg font-semibold mt-1 text-white">
            {t.quickActions.scheduleSubtitle}
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            {t.quickActions.scheduleBody}
          </p>
        </div>

        {/* Card 2: PTO / Day Off */}
        <div
          onClick={() => goTo("/request-dayoff-internal")}
          className="p-5 rounded-xl bg-[#0f172a]/70 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/40 hover:bg-[#1e293b]/70
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            {t.quickActions.ptoTitle}
          </div>
          <div className="text-lg font-semibold mt-1 text-white">
            {t.quickActions.ptoSubtitle}
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            {t.quickActions.ptoBody}
          </p>
        </div>

        {/* Card 3: Status */}
        <div
          onClick={() => goTo("/dayoff-status-internal")}
          className="p-5 rounded-xl bg-[#0f172a]/70 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/40 hover:bg-[#1e293b]/70
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            {t.quickActions.statusTitle}
          </div>
          <div className="text-lg font-semibold mt-1 text-white">
            {t.quickActions.statusSubtitle}
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            {t.quickActions.statusBody}
          </p>
        </div>
      </div>

      {/* ✔ Anuncios */}
      <h2 className="text-lg font-semibold text-white mb-3 tracking-wide">
        {t.newsTitle}
      </h2>

      {loading && (
        <div className="bg-[#0f172a]/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-sm text-slate-300">
          {t.loading}
        </div>
      )}

      {!loading && announcements.length === 0 && (
        <div className="bg-[#0f172a]/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-sm text-slate-300">
          {t.empty}
        </div>
      )}

      {!loading &&
        announcements.map((item) => (
          <div
            key={item.id}
            className="p-5 mb-3 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg"
          >
            <div className="flex justify-between items-center gap-2">
              <h3 className="text-base font-semibold text-white tracking-wide">
                {item.title || "Announcement"}
              </h3>
              {item.createdAt?.toDate && (
                <span className="text-[11px] text-blue-300 whitespace-nowrap">
                  {item.createdAt.toDate().toLocaleDateString()}
                </span>
              )}
            </div>

            {item.subtitle && (
              <p className="text-xs text-blue-200 mt-1">{item.subtitle}</p>
            )}

            {item.body && (
              <p className="text-sm text-slate-300 whitespace-pre-line mt-2 leading-relaxed">
                {item.body}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
