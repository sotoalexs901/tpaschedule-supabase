// src/pages/EmployeeDashboardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Crew Member"
  );
}

function getVisiblePosition(user) {
  return user?.position || getDefaultPosition(user?.role);
}

function getInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "U";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function StatChip({ label, value }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 16,
        padding: "10px 14px",
        minWidth: 130,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.72)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "5px 0 0",
          fontSize: 18,
          fontWeight: 800,
          color: "#ffffff",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function QuickActionCard({ title, subtitle, body, onClick, accent, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl bg-[#0f172a]/72 backdrop-blur-lg border border-white/10 shadow-lg hover:shadow-blue-500/30 hover:border-blue-400/40 hover:bg-[#1e293b]/75 transition duration-300 cursor-pointer bg-gradient-to-br ${accent}`}
      style={{
        minHeight: 180,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          marginBottom: 14,
        }}
      >
        {icon}
      </div>

      <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
        {title}
      </div>

      <div className="text-lg font-semibold mt-1 text-white">{subtitle}</div>

      <p className="text-xs text-slate-300 mt-2 leading-relaxed">{body}</p>
    </button>
  );
}

function LeaderboardCard({ title, subtitle, rows, emptyText }) {
  return (
    <div className="rounded-2xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
      </div>

      {!rows.length ? (
        <div className="text-sm text-slate-400">{emptyText}</div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <div
              key={`${row.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background:
                      index === 0
                        ? "rgba(59,130,246,0.24)"
                        : "rgba(255,255,255,0.08)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {row.name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {row.position}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold text-sky-300">{row.value}</div>
                <div className="text-[11px] text-slate-400">{row.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("en");

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(() => getVisiblePosition(user), [user]);
  const profilePhotoURL = user?.profilePhotoURL || "";

  const copy = {
    en: {
      crewPortal: "Crew Portal",
      welcome: "Welcome,",
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
      bannerTag: "Schedule Update",
      bannerTitle: "New schedule experience coming soon",
      bannerBody:
        "We are improving how you see and access your schedules. Stay tuned for upcoming updates and features.",
      newsTitle: "Station News & Events",
      loading: "Loading announcements...",
      empty: "No announcements available.",
      activeCards: "Quick Access",
      totalNews: "Announcements",
      myAccess: "Portal Access",
      latestTitle: "Latest update",
      createdBy: "Posted by",
      wchrTopToday: "Top WCHR Today",
      wchrTopWeek: "Top WCHR This Week",
      wchrTopTodaySub: "This section will rank the strongest WCHR performers of the day.",
      wchrTopWeekSub: "This section will rank the strongest WCHR performers of the week.",
      emptyLeaderboard: "No ranking data available yet.",
      companyBirthdays: "Company Birthdays",
      companyBirthdaysSub: "Birthday calendar widget will be added here soon.",
    },
    es: {
      crewPortal: "Portal de Tripulación",
      welcome: "Bienvenido(a),",
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
      bannerTag: "Actualización de Horarios",
      bannerTitle: "¡Nuevos cambios en los horarios muy pronto!",
      bannerBody:
        "Estamos mejorando la manera en que ves y accedes a tus horarios. Mantente pendiente de las próximas actualizaciones y funciones.",
      newsTitle: "Noticias y Eventos de la Estación",
      loading: "Cargando anuncios...",
      empty: "No hay anuncios disponibles.",
      activeCards: "Accesos Rápidos",
      totalNews: "Anuncios",
      myAccess: "Acceso al Portal",
      latestTitle: "Última novedad",
      createdBy: "Publicado por",
      wchrTopToday: "Top WCHR Hoy",
      wchrTopWeek: "Top WCHR Semana",
      wchrTopTodaySub: "Aquí aparecerá el ranking de empleados con más WCHR del día.",
      wchrTopWeekSub: "Aquí aparecerá el ranking de empleados con más WCHR de la semana.",
      emptyLeaderboard: "Aún no hay datos de ranking disponibles.",
      companyBirthdays: "Cumpleaños de la Compañía",
      companyBirthdaysSub: "Aquí agregaremos pronto el widget del calendario de cumpleaños.",
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

  const quickCards = useMemo(
    () => [
      {
        title: t.quickActions.scheduleTitle,
        subtitle: t.quickActions.scheduleSubtitle,
        body: t.quickActions.scheduleBody,
        onClick: () => goTo("/my-schedule"),
        accent: "from-blue-500/30 to-cyan-400/20",
        icon: "📅",
      },
      {
        title: t.quickActions.ptoTitle,
        subtitle: t.quickActions.ptoSubtitle,
        body: t.quickActions.ptoBody,
        onClick: () => goTo("/request-dayoff-internal"),
        accent: "from-indigo-500/30 to-blue-400/20",
        icon: "🌴",
      },
      {
        title: t.quickActions.statusTitle,
        subtitle: t.quickActions.statusSubtitle,
        body: t.quickActions.statusBody,
        onClick: () => goTo("/dayoff-status-internal"),
        accent: "from-sky-500/30 to-indigo-400/20",
        icon: "📍",
      },
      {
        title: t.quickActions.wchrScanTitle,
        subtitle: t.quickActions.wchrScanSubtitle,
        body: t.quickActions.wchrScanBody,
        onClick: () => goTo("/wchr/scan"),
        accent: "from-teal-500/30 to-cyan-400/20",
        icon: "🎫",
      },
      {
        title: t.quickActions.wchrReportsTitle,
        subtitle: t.quickActions.wchrReportsSubtitle,
        body: t.quickActions.wchrReportsBody,
        onClick: () => goTo("/wchr/my-reports"),
        accent: "from-emerald-500/30 to-teal-400/20",
        icon: "📄",
      },
    ],
    [t]
  );

  const featuredAnnouncement = announcements[0] || null;

  const placeholderTopToday = useMemo(
    () => [
      { name: "Coming Soon", position: "WCHR Leaderboard", value: "—", label: "Today" },
    ],
    []
  );

  const placeholderTopWeek = useMemo(
    () => [
      { name: "Coming Soon", position: "WCHR Leaderboard", value: "—", label: "Week" },
    ],
    []
  );

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background: "radial-gradient(circle at top, #0a0f24 0%, #020617 70%)",
        color: "white",
        fontFamily: "Poppins, system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div
          className="rounded-3xl border border-white/10 shadow-2xl overflow-hidden mb-6"
          style={{
            background:
              "linear-gradient(135deg, rgba(14,165,233,0.24) 0%, rgba(37,99,235,0.20) 40%, rgba(79,70,229,0.18) 100%)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="p-5 md:p-7">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
              <div className="min-w-0 flex items-start gap-4">
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 22,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#fff",
                  }}
                >
                  {profilePhotoURL ? (
                    <img
                      src={profilePhotoURL}
                      alt={visibleName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span>{getInitials(visibleName)}</span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs text-slate-300 uppercase tracking-[0.25em]">
                    {t.crewPortal}
                  </p>

                  <h1 className="text-2xl md:text-4xl font-bold tracking-wide text-white mt-2 leading-tight">
                    {t.welcome} {visibleName}
                  </h1>

                  <p className="text-sm text-blue-200 mt-2 font-medium">
                    {visiblePosition}
                  </p>

                  <p className="text-xs text-slate-400 mt-1">
                    @{user?.username || "user"}
                  </p>

                  <p className="text-sm text-slate-300 mt-3 max-w-3xl leading-relaxed">
                    {t.intro}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 self-start xl:self-end">
                  <span className="text-[11px] text-slate-300 uppercase tracking-wide mr-1">
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

                <div className="flex flex-wrap gap-3">
                  <StatChip label={t.myAccess} value={visiblePosition} />
                  <StatChip label={t.activeCards} value={quickCards.length} />
                  <StatChip label={t.totalNews} value={announcements.length} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Banner */}
        <div className="mb-7 rounded-2xl bg-gradient-to-r from-sky-500/80 via-indigo-500/85 to-blue-700/85 border border-white/20 shadow-xl shadow-blue-900/50 px-4 py-4 md:px-6 md:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-xs md:text-[13px] uppercase tracking-[0.25em] text-blue-100/90">
              {t.bannerTag}
            </p>
            <h2 className="text-sm md:text-lg font-semibold text-white mt-1">
              {t.bannerTitle}
            </h2>
            <p className="text-[11px] md:text-sm text-blue-50 mt-1 max-w-3xl leading-relaxed">
              {t.bannerBody}
            </p>
          </div>
          <div className="text-xs text-blue-50 md:text-right opacity-90 font-medium">
            ✨ Be on the loop
          </div>
        </div>

        {/* Upcoming modules */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-8">
          <LeaderboardCard
            title={t.wchrTopToday}
            subtitle={t.wchrTopTodaySub}
            rows={placeholderTopToday}
            emptyText={t.emptyLeaderboard}
          />

          <LeaderboardCard
            title={t.wchrTopWeek}
            subtitle={t.wchrTopWeekSub}
            rows={placeholderTopWeek}
            emptyText={t.emptyLeaderboard}
          />

          <div className="rounded-2xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg p-5">
            <h3 className="text-base font-semibold text-white">
              {t.companyBirthdays}
            </h3>
            <p className="text-xs text-slate-400 mt-1">{t.companyBirthdaysSub}</p>

            <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-400">
              Birthday calendar placeholder
            </div>
          </div>
        </div>

        {/* Featured announcement */}
        {!loading && featuredAnnouncement && (
          <div className="mb-8 rounded-2xl overflow-hidden border border-white/10 bg-[#0f172a]/70 backdrop-blur-lg shadow-lg">
            <div className="p-5 border-b border-white/10">
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-300 font-semibold">
                {t.latestTitle}
              </p>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-2">
                <h2 className="text-xl md:text-2xl font-bold text-white">
                  {featuredAnnouncement.title || "Announcement"}
                </h2>
                {featuredAnnouncement.createdAt?.toDate && (
                  <span className="text-[11px] text-blue-300 whitespace-nowrap">
                    {featuredAnnouncement.createdAt.toDate().toLocaleDateString()}
                  </span>
                )}
              </div>

              {featuredAnnouncement.subtitle && (
                <p className="text-sm text-blue-200 mt-2">
                  {featuredAnnouncement.subtitle}
                </p>
              )}

              {featuredAnnouncement.body && (
                <p className="text-sm text-slate-300 mt-3 leading-relaxed whitespace-pre-line max-w-4xl">
                  {featuredAnnouncement.body}
                </p>
              )}

              {featuredAnnouncement.createdBy && (
                <p className="text-xs text-slate-400 mt-3">
                  {t.createdBy}: <b>{featuredAnnouncement.createdBy}</b>
                </p>
              )}
            </div>

            {featuredAnnouncement.imageUrl && (
              <div className="w-full">
                <img
                  src={featuredAnnouncement.imageUrl}
                  alt={featuredAnnouncement.title || "Announcement"}
                  className="w-full max-h-[360px] object-cover"
                />
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white tracking-wide">
              {t.activeCards}
            </h2>
            <span className="text-xs text-slate-400">
              {quickCards.length} modules
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {quickCards.map((card) => (
              <QuickActionCard key={card.title} {...card} />
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-white tracking-wide">
            {t.newsTitle}
          </h2>
          {!loading && announcements.length > 0 && (
            <span className="text-xs text-slate-400">
              {announcements.length} items
            </span>
          )}
        </div>

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
            {announcements.map((item, index) => (
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
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300 font-semibold">
                          #{String(index + 1).padStart(2, "0")}
                        </span>
                      </div>

                      <h3 className="text-base md:text-lg font-semibold text-white tracking-wide">
                        {item.title || "Announcement"}
                      </h3>

                      {item.subtitle && (
                        <p className="text-xs text-blue-200 mt-1">
                          {item.subtitle}
                        </p>
                      )}
                    </div>

                    {item.createdAt?.toDate && (
                      <span className="text-[11px] text-blue-300 whitespace-nowrap">
                        {item.createdAt.toDate().toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {item.body && (
                    <p className="text-sm text-slate-300 whitespace-pre-line mt-3 leading-relaxed">
                      {item.body}
                    </p>
                  )}

                  {item.createdBy && (
                    <p className="text-xs text-slate-400 mt-3">
                      {t.createdBy}: <b>{item.createdBy}</b>
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
