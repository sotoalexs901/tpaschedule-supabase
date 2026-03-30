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

function parseBirthDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameMonthAndDay(a, b) {
  return (
    a &&
    b &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatBirthday(date, language = "en") {
  if (!date) return "—";
  return date.toLocaleDateString(language === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
  });
}

function daysUntilBirthday(date) {
  if (!date) return null;

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(current.getFullYear(), date.getMonth(), date.getDate());

  if (next < current) {
    next = new Date(current.getFullYear() + 1, date.getMonth(), date.getDate());
  }

  const diff = next.getTime() - current.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function StatCard({ title, value, subtitle, accent, icon, isMobile }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: isMobile ? 18 : 22,
        padding: isMobile ? 16 : 18,
        boxShadow: "0 16px 36px rgba(23,105,170,0.08)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${accent}16 0%, transparent 58%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          position: "relative",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {title}
          </p>
          <h3
            style={{
              margin: "8px 0 4px",
              fontSize: isMobile ? 24 : 28,
              lineHeight: 1.05,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.03em",
            }}
          >
            {value}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#475569",
            }}
          >
            {subtitle}
          </p>
        </div>

        <div
          style={{
            width: isMobile ? 40 : 44,
            height: isMobile ? 40 : 44,
            borderRadius: 14,
            background: `${accent}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isMobile ? 18 : 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function GlassCard({
  title,
  icon,
  action,
  children,
  accent = "#1769aa",
  isMobile,
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: isMobile ? 20 : 24,
        padding: isMobile ? 16 : 20,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: `${accent}16`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {title}
          </h2>
        </div>
        {action}
      </div>

      {children}
    </div>
  );
}

function QuickActionTile({ title, subtitle, body, onClick, accent, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        width: "100%",
        border: "1px solid #dbeafe",
        background: `linear-gradient(135deg, ${accent}12 0%, #ffffff 75%)`,
        borderRadius: 18,
        padding: 16,
        cursor: "pointer",
        boxShadow: "0 10px 20px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          background: `${accent}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          marginBottom: 12,
        }}
      >
        {icon}
      </div>

      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 17,
          fontWeight: 800,
          color: "#0f172a",
          lineHeight: 1.2,
        }}
      >
        {subtitle}
      </div>

      <p
        style={{
          margin: "8px 0 0",
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        {body}
      </p>
    </button>
  );
}

function BirthdayRow({ person, language, tag }) {
  const initials = getInitials(person.displayName);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 16,
        padding: 14,
        background: "linear-gradient(135deg, #fdf2f8 0%, #ffffff 100%)",
        border: "1px solid #fbcfe8",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            overflow: "hidden",
            background: "#fce7f3",
            border: "1px solid #fbcfe8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9d174d",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {person.profilePhotoURL ? (
            <img
              src={person.profilePhotoURL}
              alt={person.displayName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
              wordBreak: "break-word",
            }}
          >
            {person.displayName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {person.position}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "#be185d",
          }}
        >
          {formatBirthday(person.birthDateParsed, language)}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "#64748b",
          }}
        >
          {tag}
        </div>
      </div>
    </div>
  );
}

function LeaderRow({ row, accent = "#1769aa" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 16,
        padding: 14,
        background: "linear-gradient(135deg, #edf7ff 0%, #ffffff 100%)",
        border: "1px solid #dbeafe",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: `${accent}18`,
            color: accent,
            fontSize: 13,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {row.rank}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {row.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {row.position}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: accent,
          }}
        >
          {row.value}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
          }}
        >
          {row.label}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile(900);

  const [announcements, setAnnouncements] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("en");

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(() => getVisiblePosition(user), [user]);
  const profilePhotoURL = user?.profilePhotoURL || "";

  const copy = {
    en: {
      crewPortal: "Crew Portal",
      welcome: "Welcome back,",
      intro:
        "Quick overview of your day, requests, WCHR tools and station updates.",
      quickActionsTitle: "Quick Access",
      quickActions: {
        scheduleTitle: "Schedule",
        scheduleSubtitle: "My Schedule",
        scheduleBody: "Review your assigned weekly schedule and shift details.",
        ptoTitle: "Time Off",
        ptoSubtitle: "Request PTO",
        ptoBody: "Submit a PTO or day-off request directly in the portal.",
        statusTitle: "Requests",
        statusSubtitle: "PTO Status",
        statusBody: "Check if your request is pending, approved or returned.",
        wchrScanTitle: "WCHR",
        wchrScanSubtitle: "Scan Boarding Pass",
        wchrScanBody: "Create a new WCHR report from a boarding pass scan.",
        wchrReportsTitle: "Reports",
        wchrReportsSubtitle: "My WCHR Reports",
        wchrReportsBody: "Review, edit and manage your recent WCHR reports.",
      },
      bannerTitle: "Schedule update",
      bannerBody:
        "We are improving how you view and access your schedules. Stay tuned for upcoming updates and features.",
      announcementsTitle: "Crew Announcements",
      announcementsEmpty: "No announcements available.",
      loading: "Loading dashboard...",
      latestAnnouncement: "Latest Announcement",
      postedBy: "Posted by",
      portalAccess: "Portal Access",
      modules: "Modules",
      totalNews: "Announcements",
      birthdaysToday: "Today's Birthdays",
      birthdaysMonth: "This Month's Birthdays",
      birthdaysEmptyToday: "No birthdays today.",
      birthdaysEmptyMonth: "No birthdays this month.",
      birthdayTodayTag: "Today",
      birthdaySoonTag: "Coming up",
      wchrTopToday: "Top WCHR Today",
      wchrTopWeek: "Top WCHR This Week",
      topTodaySub: "Daily WCHR performance ranking.",
      topWeekSub: "Weekly WCHR performance ranking.",
      comingSoon: "Coming Soon",
      leaderboard: "Leaderboard",
      today: "Today",
      week: "Week",
    },
    es: {
      crewPortal: "Portal de Tripulación",
      welcome: "Bienvenido(a),",
      intro:
        "Resumen rápido de tu día, solicitudes, herramientas WCHR y actualizaciones de la estación.",
      quickActionsTitle: "Accesos Rápidos",
      quickActions: {
        scheduleTitle: "Horario",
        scheduleSubtitle: "Mi Horario",
        scheduleBody: "Revisa tu horario semanal asignado y los detalles de turno.",
        ptoTitle: "Tiempo Libre",
        ptoSubtitle: "Solicitar PTO",
        ptoBody: "Envía una solicitud de PTO o día libre directamente en el portal.",
        statusTitle: "Solicitudes",
        statusSubtitle: "Estatus PTO",
        statusBody: "Verifica si tu solicitud está pendiente, aprobada o devuelta.",
        wchrScanTitle: "WCHR",
        wchrScanSubtitle: "Escanear Boarding Pass",
        wchrScanBody: "Crea un nuevo reporte WCHR desde el escaneo del pase.",
        wchrReportsTitle: "Reportes",
        wchrReportsSubtitle: "Mis Reportes WCHR",
        wchrReportsBody: "Revisa, edita y administra tus reportes WCHR recientes.",
      },
      bannerTitle: "Actualización de horarios",
      bannerBody:
        "Estamos mejorando la manera en que ves y accedes a tus horarios. Mantente pendiente de las próximas actualizaciones y funciones.",
      announcementsTitle: "Anuncios de Tripulación",
      announcementsEmpty: "No hay anuncios disponibles.",
      loading: "Cargando dashboard...",
      latestAnnouncement: "Último Anuncio",
      postedBy: "Publicado por",
      portalAccess: "Acceso",
      modules: "Módulos",
      totalNews: "Anuncios",
      birthdaysToday: "Cumpleaños de Hoy",
      birthdaysMonth: "Cumpleaños del Mes",
      birthdaysEmptyToday: "No hay cumpleaños hoy.",
      birthdaysEmptyMonth: "No hay cumpleaños este mes.",
      birthdayTodayTag: "Hoy",
      birthdaySoonTag: "Próximo",
      wchrTopToday: "Top WCHR Hoy",
      wchrTopWeek: "Top WCHR Semana",
      topTodaySub: "Ranking diario de desempeño WCHR.",
      topWeekSub: "Ranking semanal de desempeño WCHR.",
      comingSoon: "Próximamente",
      leaderboard: "Ranking",
      today: "Hoy",
      week: "Semana",
    },
  };

  const t = copy[language];

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const qAnnouncements = query(
          collection(db, "employeeAnnouncements"),
          orderBy("createdAt", "desc")
        );
        const announcementsSnap = await getDocs(qAnnouncements);
        const announcementList = announcementsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const sortedAnnouncements = announcementList.sort((a, b) => {
          const aPinned = a.pinned ? 1 : 0;
          const bPinned = b.pinned ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;

          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        const todayStr = new Date().toISOString().slice(0, 10);
        const filteredAnnouncements = sortedAnnouncements.filter((item) => {
          if (!item.expiresOn) return true;
          return item.expiresOn >= todayStr;
        });

        setAnnouncements(filteredAnnouncements);

        const usersSnap = await getDocs(collection(db, "users"));
        const birthdayList = usersSnap.docs
          .map((d) => {
            const data = d.data();
            const parsedDate = parseBirthDate(data.birthDate);

            return {
              id: d.id,
              displayName:
                data.displayName ||
                data.fullName ||
                data.name ||
                data.username ||
                "Team Member",
              position: data.position || getDefaultPosition(data.role),
              profilePhotoURL: data.profilePhotoURL || "",
              birthDateParsed: parsedDate,
              daysAway: daysUntilBirthday(parsedDate),
            };
          })
          .filter((item) => item.birthDateParsed);

        setBirthdays(birthdayList);
      } catch (err) {
        console.error("Error loading employee dashboard:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData().catch(console.error);
  }, []);

  const goTo = (path) => navigate(path);

  const quickCards = useMemo(
    () => [
      {
        title: t.quickActions.scheduleTitle,
        subtitle: t.quickActions.scheduleSubtitle,
        body: t.quickActions.scheduleBody,
        onClick: () => goTo("/my-schedule"),
        accent: "#1f7cc1",
        icon: "📅",
      },
      {
        title: t.quickActions.ptoTitle,
        subtitle: t.quickActions.ptoSubtitle,
        body: t.quickActions.ptoBody,
        onClick: () => goTo("/request-dayoff-internal"),
        accent: "#4f46e5",
        icon: "🌴",
      },
      {
        title: t.quickActions.statusTitle,
        subtitle: t.quickActions.statusSubtitle,
        body: t.quickActions.statusBody,
        onClick: () => goTo("/dayoff-status-internal"),
        accent: "#0ea5e9",
        icon: "📍",
      },
      {
        title: t.quickActions.wchrScanTitle,
        subtitle: t.quickActions.wchrScanSubtitle,
        body: t.quickActions.wchrScanBody,
        onClick: () => goTo("/wchr/scan"),
        accent: "#14b8a6",
        icon: "🎫",
      },
      {
        title: t.quickActions.wchrReportsTitle,
        subtitle: t.quickActions.wchrReportsSubtitle,
        body: t.quickActions.wchrReportsBody,
        onClick: () => goTo("/wchr/my-reports"),
        accent: "#10b981",
        icon: "📄",
      },
    ],
    [t]
  );

  const featuredAnnouncement = announcements[0] || null;

  const todayBirthdays = useMemo(() => {
    const today = new Date();
    return birthdays.filter((item) =>
      sameMonthAndDay(item.birthDateParsed, today)
    );
  }, [birthdays]);

  const monthBirthdays = useMemo(() => {
    const today = new Date();

    return birthdays
      .filter((item) => item.birthDateParsed?.getMonth() === today.getMonth())
      .sort((a, b) => a.birthDateParsed.getDate() - b.birthDateParsed.getDate());
  }, [birthdays]);

  const topToday = useMemo(
    () => [
      {
        rank: 1,
        name: t.comingSoon,
        position: t.leaderboard,
        value: "—",
        label: t.today,
      },
    ],
    [t]
  );

  const topWeek = useMemo(
    () => [
      {
        rank: 1,
        name: t.comingSoon,
        position: t.leaderboard,
        value: "—",
        label: t.week,
      },
    ],
    [t]
  );

  const stats = useMemo(
    () => [
      {
        title: t.portalAccess,
        value: visiblePosition,
        subtitle: "TPA OPS",
        accent: "#1f7cc1",
        icon: "👤",
      },
      {
        title: t.modules,
        value: quickCards.length,
        subtitle: "Active shortcuts",
        accent: "#10b981",
        icon: "⚡",
      },
      {
        title: t.totalNews,
        value: announcements.length,
        subtitle: "Current updates",
        accent: "#f59e0b",
        icon: "📣",
      },
    ],
    [visiblePosition, quickCards.length, announcements.length, t]
  );

  return (
    <div
      style={{
        minHeight: "100%",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 22 : 28,
          padding: isMobile ? 18 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: isMobile ? 180 : 240,
            height: isMobile ? 180 : 240,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: isMobile ? -80 : -90,
            right: isMobile ? -60 : -50,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: isMobile ? 120 : 160,
            height: isMobile ? 120 : 160,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.06)",
            bottom: -50,
            right: isMobile ? 60 : 160,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: isMobile ? 64 : 72,
                height: isMobile ? 64 : 72,
                borderRadius: 22,
                overflow: "hidden",
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: isMobile ? 22 : 24,
                fontWeight: 800,
                flexShrink: 0,
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

            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "rgba(255,255,255,0.76)",
                  fontWeight: 700,
                }}
              >
                {t.crewPortal}
              </p>

              <h1
                style={{
                  margin: "10px 0 6px",
                  fontSize: isMobile ? 26 : 34,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                }}
              >
                {t.welcome} {visibleName}
              </h1>

              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 700,
                }}
              >
                {visiblePosition}
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                @{user?.username || "user"}
              </p>

              <p
                style={{
                  margin: "12px 0 0",
                  maxWidth: 720,
                  fontSize: isMobile ? 13 : 14,
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                {t.intro}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              width: isMobile ? "100%" : "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: isMobile ? "flex-start" : "flex-end",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                Language
              </span>

              <button
                type="button"
                onClick={() => setLanguage("en")}
                style={{
                  border: "1px solid rgba(255,255,255,0.22)",
                  background:
                    language === "en"
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.10)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                EN
              </button>

              <button
                type="button"
                onClick={() => setLanguage("es")}
                style={{
                  border: "1px solid rgba(255,255,255,0.22)",
                  background:
                    language === "es"
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.10)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ES
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {stats.map((item) => (
          <StatCard key={item.title} {...item} isMobile={isMobile} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(0, 1.5fr) minmax(320px, 1fr)",
          gap: 18,
        }}
      >
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <GlassCard
            title={t.quickActionsTitle}
            icon="⚡"
            accent="#1769aa"
            isMobile={isMobile}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {quickCards.map((card) => (
                <QuickActionTile key={card.title} {...card} />
              ))}
            </div>
          </GlassCard>

          {!loading && featuredAnnouncement && (
            <GlassCard
              title={t.latestAnnouncement}
              icon="📢"
              accent="#1f7cc1"
              isMobile={isMobile}
            >
              <div
                style={{
                  borderRadius: 18,
                  overflow: "hidden",
                  background: "linear-gradient(135deg, #edf7ff 0%, #ffffff 100%)",
                  border: "1px solid #d6ebff",
                }}
              >
                <div style={{ padding: 16 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: isMobile ? 18 : 20,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {featuredAnnouncement.title || "Announcement"}
                  </h3>

                  {featuredAnnouncement.subtitle && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1769aa",
                      }}
                    >
                      {featuredAnnouncement.subtitle}
                    </p>
                  )}

                  {featuredAnnouncement.body && (
                    <p
                      style={{
                        margin: "10px 0 0",
                        fontSize: 14,
                        color: "#334155",
                        lineHeight: 1.7,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {featuredAnnouncement.body}
                    </p>
                  )}

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {featuredAnnouncement.createdAt?.toDate && (
                      <span>
                        {featuredAnnouncement.createdAt
                          .toDate()
                          .toLocaleDateString()}
                      </span>
                    )}

                    {featuredAnnouncement.createdBy && (
                      <span>
                        {t.postedBy}: <b>{featuredAnnouncement.createdBy}</b>
                      </span>
                    )}
                  </div>
                </div>

                {featuredAnnouncement.imageUrl && (
                  <div
                    style={{
                      borderTop: "1px solid #dbeafe",
                      background: "#fff",
                    }}
                  >
                    <img
                      src={featuredAnnouncement.imageUrl}
                      alt={featuredAnnouncement.title || "Announcement"}
                      style={{
                        width: "100%",
                        maxHeight: 340,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          <GlassCard
            title={t.announcementsTitle}
            icon="📌"
            accent="#f59e0b"
            isMobile={isMobile}
          >
            {loading ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>{t.loading}</p>
            ) : announcements.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                {t.announcementsEmpty}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {announcements.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background:
                        "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                      border: "1px solid #fde68a",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginBottom: 6,
                          }}
                        >
                          {item.pinned && (
                            <span
                              style={{
                                padding: "5px 9px",
                                borderRadius: 999,
                                background: "#dbeafe",
                                border: "1px solid #bfdbfe",
                                color: "#1d4ed8",
                                fontSize: 11,
                                fontWeight: 800,
                                textTransform: "uppercase",
                              }}
                            >
                              Pinned
                            </span>
                          )}
                          {item.category && (
                            <span
                              style={{
                                padding: "5px 9px",
                                borderRadius: 999,
                                background: "#fff7ed",
                                border: "1px solid #fed7aa",
                                color: "#9a3412",
                                fontSize: 11,
                                fontWeight: 800,
                                textTransform: "uppercase",
                              }}
                            >
                              {item.category}
                            </span>
                          )}
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontWeight: 800,
                            color: "#0f172a",
                            fontSize: 15,
                          }}
                        >
                          {item.title || "Announcement"}
                        </p>

                        {item.subtitle && (
                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: 12,
                              color: "#b45309",
                              fontWeight: 700,
                            }}
                          >
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {item.createdAt?.toDate && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            flexShrink: 0,
                          }}
                        >
                          {item.createdAt.toDate().toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {item.body && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 13,
                          color: "#475569",
                          lineHeight: 1.6,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {item.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <GlassCard
            title={t.birthdaysToday}
            icon="🎂"
            accent="#ec4899"
            isMobile={isMobile}
          >
            {todayBirthdays.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                {t.birthdaysEmptyToday}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {todayBirthdays.map((person) => (
                  <BirthdayRow
                    key={person.id}
                    person={person}
                    language={language}
                    tag={t.birthdayTodayTag}
                  />
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={t.birthdaysMonth}
            icon="🎉"
            accent="#db2777"
            isMobile={isMobile}
          >
            {monthBirthdays.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                {t.birthdaysEmptyMonth}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {monthBirthdays.slice(0, 6).map((person) => (
                  <BirthdayRow
                    key={person.id}
                    person={person}
                    language={language}
                    tag={
                      person.daysAway === 0
                        ? t.birthdayTodayTag
                        : `${t.birthdaySoonTag}: ${person.daysAway}d`
                    }
                  />
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={t.wchrTopToday}
            icon="♿"
            accent="#0ea5e9"
            isMobile={isMobile}
          >
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {t.topTodaySub}
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {topToday.map((row) => (
                <LeaderRow key={`${row.name}-${row.rank}`} row={row} accent="#0ea5e9" />
              ))}
            </div>
          </GlassCard>

          <GlassCard
            title={t.wchrTopWeek}
            icon="📊"
            accent="#10b981"
            isMobile={isMobile}
          >
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {t.topWeekSub}
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {topWeek.map((row) => (
                <LeaderRow key={`${row.name}-${row.rank}`} row={row} accent="#10b981" />
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
