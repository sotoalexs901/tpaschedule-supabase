import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const FIXED_AUTHOR = "TPA Eulen Ops";

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
  return a && b && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

function formatEventDate(value, language = "en") {
  if (!value) return "—";
  try {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString(language === "es" ? "es-US" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();
  const upper = airline.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return airline;
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

function SpotlightCard({ item, isMobile, language }) {
  const fallbackTitle =
    language === "es" ? "Empleado del Mes" : "Employee of the Month";

  const displayImage =
    item.imageUrl || item.employeePhotoURL || item.photoURL || "";

  return (
    <div
      style={{
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(135deg, #ecfeff 0%, #ffffff 100%)",
        border: "1px solid #bae6fd",
        boxShadow: "0 12px 24px rgba(15,23,42,0.05)",
      }}
    >
      {displayImage && (
        <div
          style={{
            width: "100%",
            height: isMobile ? 180 : 220,
            background: "#e2e8f0",
          }}
        >
          <img
            src={displayImage}
            alt={item.employeeName || fallbackTitle}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>
      )}

      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          {item.airline && (
            <span
              style={{
                display: "inline-flex",
                padding: "6px 10px",
                borderRadius: 999,
                background: "#edf7ff",
                border: "1px solid #cfe7fb",
                color: "#1769aa",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {item.airline}
            </span>
          )}

          {item.department && (
            <span
              style={{
                display: "inline-flex",
                padding: "6px 10px",
                borderRadius: 999,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#475569",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {item.department}
            </span>
          )}
        </div>

        <h3
          style={{
            margin: 0,
            fontSize: isMobile ? 18 : 20,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          {item.title || fallbackTitle}
        </h3>

        <p
          style={{
            margin: "8px 0 0",
            fontSize: 15,
            color: "#0f172a",
            fontWeight: 800,
          }}
        >
          {item.employeeName || "—"}
        </p>

        {item.employeePosition && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            {item.employeePosition}
          </p>
        )}

        {item.body && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.7,
              whiteSpace: "pre-line",
            }}
          >
            {item.body}
          </p>
        )}

        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          By {FIXED_AUTHOR}
        </div>

        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              marginTop: 12,
              fontSize: 13,
              fontWeight: 700,
              color: "#1769aa",
              textDecoration: "none",
            }}
          >
            {language === "es" ? "Ver más →" : "View more →"}
          </a>
        )}
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
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [spotlights, setSpotlights] = useState([]);
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
        wchrScanTitle: "WCHR",
        wchrScanSubtitle: "Scan Boarding Pass",
        wchrScanBody: "Create a new WCHR report from a boarding pass scan.",
      },
      announcementsTitle: "Crew Announcements",
      announcementsEmpty: "No announcements available.",
      upcomingEventsTitle: "Upcoming Events",
      upcomingEventsEmpty: "No upcoming events available.",
      employeeMonthTitle: "Employee of the Month",
      employeeMonthEmpty: "No employee spotlights available.",
      loading: "Loading dashboard...",
      portalAccess: "Portal Access",
      modules: "Modules",
      totalNews: "Announcements",
      totalEvents: "Events",
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
      openLink: "Open link →",
    },
    es: {
      crewPortal: "Portal de Tripulación",
      welcome: "Bienvenido(a),",
      intro:
        "Resumen rápido de tu día, solicitudes, herramientas WCHR y actualizaciones de la estación.",
      quickActionsTitle: "Acceso Rápido",
      quickActions: {
        wchrScanTitle: "WCHR",
        wchrScanSubtitle: "Escanear Boarding Pass",
        wchrScanBody: "Crea un nuevo reporte WCHR desde el escaneo del pase.",
      },
      announcementsTitle: "Anuncios de Tripulación",
      announcementsEmpty: "No hay anuncios disponibles.",
      upcomingEventsTitle: "Próximos Eventos",
      upcomingEventsEmpty: "No hay eventos próximos.",
      employeeMonthTitle: "Empleado del Mes",
      employeeMonthEmpty: "No hay reconocimientos disponibles.",
      loading: "Cargando dashboard...",
      portalAccess: "Acceso",
      modules: "Módulos",
      totalNews: "Anuncios",
      totalEvents: "Eventos",
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
      openLink: "Abrir enlace →",
    },
  };

  const t = copy[language];

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);

        const [announcementsSnap, usersSnap, eventsSnap, spotlightsSnap] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "employeeAnnouncements"),
                orderBy("createdAt", "desc")
              )
            ),
            getDocs(collection(db, "users")),
            getDocs(
              query(
                collection(db, "employeeUpcomingEvents"),
                orderBy("eventDate", "asc")
              )
            ),
            getDocs(
              query(
                collection(db, "employeeSpotlights"),
                orderBy("createdAt", "desc")
              )
            ),
          ]);

        const announcementList = announcementsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            if (!item.expiresOn) return true;
            return item.expiresOn >= todayStr;
          });

        setAnnouncements(announcementList);

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

        const eventList = eventsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => !item.eventDate || item.eventDate >= todayStr);

        setUpcomingEvents(eventList);

        const spotlightList = spotlightsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => item.active !== false)
          .map((item) => ({
            ...item,
            airline: normalizeAirlineName(item.airline),
          }));

        setSpotlights(spotlightList);
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
        title: t.quickActions.wchrScanTitle,
        subtitle: t.quickActions.wchrScanSubtitle,
        body: t.quickActions.wchrScanBody,
        onClick: () => goTo("/wchr/scan"),
        accent: "#14b8a6",
        icon: "🎫",
      },
    ],
    [t]
  );

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

  const spotlightGroups = useMemo(() => {
    const map = {};

    spotlights.forEach((item) => {
      const airline = item.airline || "OTHER";
      if (!map[airline]) map[airline] = [];
      map[airline].push(item);
    });

    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [spotlights]);

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
      {
        title: t.totalEvents,
        value: upcomingEvents.length,
        subtitle: "Upcoming items",
        accent: "#8b5cf6",
        icon: "📅",
      },
    ],
    [visiblePosition, quickCards.length, announcements.length, upcomingEvents.length, t]
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
            : "minmax(0, 1.6fr) minmax(320px, 1fr)",
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
                gridTemplateColumns: "1fr",
                gap: 12,
              }}
            >
              {quickCards.map((card) => (
                <QuickActionTile key={card.title} {...card} />
              ))}
            </div>
          </GlassCard>

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
              <div style={{ display: "grid", gap: 12 }}>
                {announcements.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderRadius: 16,
                      overflow: "hidden",
                      background:
                        "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                      border: "1px solid #fde68a",
                    }}
                  >
                    {item.imageUrl && (
                      <div
                        style={{
                          width: "100%",
                          maxHeight: 260,
                          background: "#f8fafc",
                        }}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title || "Announcement"}
                          style={{
                            width: "100%",
                            maxHeight: 260,
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </div>
                    )}

                    <div style={{ padding: 14 }}>
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

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        By {FIXED_AUTHOR}
                      </div>

                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-block",
                            marginTop: 10,
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#1769aa",
                            textDecoration: "none",
                          }}
                        >
                          {t.openLink}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={t.upcomingEventsTitle}
            icon="📅"
            accent="#8b5cf6"
            isMobile={isMobile}
          >
            {loading ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>{t.loading}</p>
            ) : upcomingEvents.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                {t.upcomingEventsEmpty}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {upcomingEvents.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background:
                        "linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)",
                      border: "1px solid #ddd6fe",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        color: "#0f172a",
                        fontSize: 15,
                      }}
                    >
                      {item.title || "Event"}
                    </p>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 12,
                        color: "#7c3aed",
                        fontWeight: 700,
                      }}
                    >
                      {formatEventDate(item.eventDate, language)}
                      {item.eventTime ? ` • ${item.eventTime}` : ""}
                    </p>

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

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 700,
                      }}
                    >
                      By {FIXED_AUTHOR}
                    </div>

                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1769aa",
                          textDecoration: "none",
                        }}
                      >
                        {t.openLink}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={t.employeeMonthTitle}
            icon="🏆"
            accent="#06b6d4"
            isMobile={isMobile}
          >
            {loading ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>{t.loading}</p>
            ) : spotlightGroups.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                {t.employeeMonthEmpty}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {spotlightGroups.map(([airline, items]) => (
                  <div key={airline}>
                    <div
                      style={{
                        marginBottom: 10,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#1769aa",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {airline}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {items.map((item) => (
                        <SpotlightCard
                          key={item.id}
                          item={item}
                          isMobile={isMobile}
                          language={language}
                        />
                      ))}
                    </div>
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
