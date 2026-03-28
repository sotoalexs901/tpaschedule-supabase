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

  const copy = {
    en: {
      crewPortal: "Crew Portal",
      welcome: "Welcome,",
      roleAgent: "Crew Agent",
      roleSupervisor: "Supervisor",
      intro:
        "Manage your workday, requests, reports, and stay updated with station news.",
      quickActions: {
        scheduleTitle: "My Schedule",
        scheduleSubtitle: "Weekly Hours",
        scheduleBody: "View your approved schedules and weekly assignments.",

        ptoTitle: "PTO & Day Off",
        ptoSubtitle: "Send Request",
        ptoBody: "Submit time-off requests directly to HR/Management.",

        statusTitle: "Request Status",
        statusSubtitle: "Track Status",
        statusBody:
          "See if your requests were approved, pending, or returned.",

        wchrScanTitle: "WCHR Scan",
        wchrScanSubtitle: "Scan Boarding Pass",
        wchrScanBody:
          "Scan a boarding pass and submit a new WCHR report quickly.",

        wchrReportsTitle: "My WCHR Reports",
        wchrReportsSubtitle: "Recent Reports",
        wchrReportsBody:
          "Review your latest WCHR submissions and check their current status.",
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
        "Administra tu jornada, solicitudes, reportes y mantente al día con las noticias de la estación.",
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

        wchrScanTitle: "Escaneo WCHR",
        wchrScanSubtitle: "Escanear Boarding Pass",
        wchrScanBody:
          "Escanea un boarding pass y envía rápidamente un nuevo reporte WCHR.",

        wchrReportsTitle: "Mis Reportes WCHR",
        wchrReportsSubtitle: "Reportes Recientes",
        wchrReportsBody:
          "Revisa tus últimos reportes WCHR y verifica su estatus actual.",
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

  const quickCards = [
    {
      title: t.quickActions.scheduleTitle,
      subtitle: t.quickActions.scheduleSubtitle,
      body: t.quickActions.scheduleBody,
      onClick: () => goTo("/my-schedule"),
      accent: "from-blue-500/30 to-cyan-400/20",
    },
    {
      title: t.quickActions.ptoTitle,
      subtitle: t.quickActions.ptoSubtitle,
      body: t.quickActions.ptoBody,
      onClick: () => goTo("/request-dayoff-internal"),
      accent: "from-indigo-500/30 to-blue-400/20",
    },
    {
      title: t.quickActions.statusTitle,
      subtitle: t.quickActions.statusSubtitle,
      body: t.quickActions.statusBody,
      onClick: () => goTo("/dayoff-status-internal"),
      accent: "from-sky-500/30 to-indigo-400/20",
    },
    {
      title: t.quickActions.wchrScanTitle,
      subtitle: t.quickActions.wchrScanSubtitle,
      body: t.quickActions.wchrScanBody,
      onClick: () => goTo("/wchr/scan"),
      accent: "from-teal-500/30 to-cyan-400/20",
    },
    {
      title: t.quickActions.wchrReportsTitle,
      subtitle: t.quickActions.wchrReportsSubtitle,
      body: t.quickActions.wchrReportsBody,
      onClick: () => goTo("/wchr/my-reports"),
      accent: "from-emerald-500/30 to-teal-400/20",
    },
  ];

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background:
          "radial-gradient(circle at top, #0a0f24 0%, #020617 70%)",
        color: "white",
        fontFamily: "Poppins, system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Top bar */}
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
            <p className="text-xs text-slate-400 mt-2 max-w-2xl leading-relaxed">
              {t.intro}
            </p>
          </div>

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

        {/* Banner */}
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
          {quickCards.map((card) => (
            <div
              key={card.title}
              onClick={card.onClick}
              className={`p-5 rounded-2xl bg-[#0f172a]/70 backdrop-blur-lg border border-white/10 shadow-lg hover:shadow-blue-500/30 hover:border-blue-400/40 hover:bg-[#1e293b]/70 transition duration-300 cursor-pointer bg-gradient-to-br ${card.accent}`}
            >
              <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
                {card.title}
              </div>
              <div className="text-lg font-semibold mt-1 text-white">
                {card.subtitle}
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {card.body}
              </p>
            </div>
          ))}
        </div>

        {/* Announcements */}
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

        {!loading && announcements.length > 0 && (
          <div className="grid gap-4">
            {announcements.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg overflow-hidden"
              >
                {item.imageUrl && (
                  <div className="w-full border-b border-white/10">
                    <img
                      src={item.imageUrl}
                      alt={item.title || "Announcement"}
                      className="w-full max-h-[340px] object-cover"
                    />
                  </div>
                )}

                <div className="p-5">
                  <div className="flex justify-between items-center gap-2">
                    <h3 className="text-base md:text-lg font-semibold text-white tracking-wide">
                      {item.title || "Announcement"}
                    </h3>
                    {item.createdAt?.toDate && (
                      <span className="text-[11px] text-blue-300 whitespace-nowrap">
                        {item.createdAt.toDate().toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {item.subtitle && (
                    <p className="text-xs text-blue-200 mt-1">
                      {item.subtitle}
                    </p>
                  )}

                  {item.body && (
                    <p className="text-sm text-slate-300 whitespace-pre-line mt-3 leading-relaxed">
                      {item.body}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
