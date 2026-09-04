// src/pages/EmployeeDashboardPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

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

  const parts = clean
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function parseBirthDate(value) {
  if (!value) return null;

  if (
    typeof value?.toDate ===
    "function"
  ) {
    const d = value.toDate();
    return Number.isNaN(
      d.getTime()
    )
      ? null
      : d;
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const d = new Date(
      `${value}T00:00:00`
    );

    return Number.isNaN(
      d.getTime()
    )
      ? null
      : d;
  }

  const d = new Date(value);

  return Number.isNaN(
    d.getTime()
  )
    ? null
    : d;
}

function sameMonthAndDay(a, b) {
  return (
    a &&
    b &&
    a.getMonth() ===
      b.getMonth() &&
    a.getDate() ===
      b.getDate()
  );
}

function formatBirthday(
  date,
  language = "en"
) {
  if (!date) return "\u2014";

  return date.toLocaleDateString(
    language === "es"
      ? "es-US"
      : "en-US",
    {
      month: "long",
      day: "numeric",
    }
  );
}

function daysUntilBirthday(date) {
  if (!date) return null;

  const today = new Date();

  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  let next = new Date(
    current.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (next < current) {
    next = new Date(
      current.getFullYear() + 1,
      date.getMonth(),
      date.getDate()
    );
  }

  const diff =
    next.getTime() -
    current.getTime();

  return Math.round(
    diff /
      (1000 * 60 * 60 * 24)
  );
}

function useIsMobile(
  breakpoint = 900
) {
  const [
    isMobile,
    setIsMobile,
  ] = useState(() =>
    typeof window !==
    "undefined"
      ? window.innerWidth <
        breakpoint
      : false
  );

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return undefined;
    }

    const onResize = () =>
      setIsMobile(
        window.innerWidth <
          breakpoint
      );

    window.addEventListener(
      "resize",
      onResize
    );

    return () =>
      window.removeEventListener(
        "resize",
        onResize
      );
  }, [breakpoint]);

  return isMobile;
}

function startOfToday() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
}

function startOfWeekMonday() {
  const now = new Date();
  const day = now.getDay();

  const diff =
    day === 0
      ? -6
      : 1 - day;

  const monday =
    new Date(now);

  monday.setDate(
    now.getDate() + diff
  );

  monday.setHours(
    0,
    0,
    0,
    0
  );

  return monday;
}

function toJsDate(value) {
  if (!value) return null;

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed;
}

function getAgentNameFromWchr(
  item
) {
  return (
    item?.employee_login ||
    item?.employee_name ||
    item?.agentName ||
    item?.employeeName ||
    item?.submittedByName ||
    item?.createdByName ||
    item?.userName ||
    item?.username ||
    "Unknown"
  );
}

function getTopAgent(
  items,
  fromDate,
  label
) {
  const counts = {};

  items.forEach((item) => {
    const createdAt =
      toJsDate(
        item?.submitted_at ||
          item?.createdAt ||
          item?.timestamp ||
          item?.date
      );

    if (!createdAt) return;
    if (createdAt < fromDate) {
      return;
    }

    const agentName =
      getAgentNameFromWchr(
        item
      );

    counts[agentName] =
      (counts[agentName] ||
        0) + 1;
  });

  const entries =
    Object.entries(
      counts
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );

  if (!entries.length) {
    return {
      rank: 1,
      name: "No activity",
      position: "Agent",
      value: "0",
      label,
    };
  }

  return {
    rank: 1,
    name: entries[0][0],
    position: "Agent",
    value: String(
      entries[0][1]
    ),
    label,
  };
}

function HeroButton({
  children,
  onClick,
  active = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border:
          "1px solid rgba(255,255,255,0.22)",
        background: active
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.10)",
        color: "#ffffff",
        borderRadius: 12,
        padding: "8px 12px",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        backdropFilter:
          "blur(8px)",
      }}
    >
      {children}
    </button>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  accent,
  icon,
  isMobile,
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.98) 100%)",
        border:
          "1px solid #dbeafe",
        borderRadius:
          isMobile
            ? 18
            : 22,
        padding:
          isMobile
            ? 15
            : 18,
        boxShadow:
          "0 14px 34px rgba(15,23,42,0.055)",
        position:
          "relative",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position:
            "absolute",
          width: 110,
          height: 110,
          borderRadius: 999,
          background: `${accent}10`,
          top: -54,
          right: -28,
          pointerEvents:
            "none",
        }}
      />

      <div
        style={{
          position:
            "relative",
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 850,
              color: "#64748b",
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize:
                isMobile
                  ? 21
                  : 25,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.05,
              letterSpacing:
                "-0.03em",
              wordBreak:
                "break-word",
            }}
          >
            {value}
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: "#64748b",
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            width:
              isMobile
                ? 38
                : 42,
            height:
              isMobile
                ? 38
                : 42,
            borderRadius: 13,
            background: `${accent}16`,
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            fontSize:
              isMobile
                ? 17
                : 19,
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
  subtitle,
  icon,
  action,
  children,
  accent = "#1769aa",
  isMobile,
}) {
  return (
    <section
      style={{
        background:
          "rgba(255,255,255,0.97)",
        border:
          "1px solid #e2e8f0",
        borderRadius:
          isMobile
            ? 20
            : 24,
        padding:
          isMobile
            ? 15
            : 19,
        boxShadow:
          "0 16px 40px rgba(15,23,42,0.055)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems:
              "flex-start",
            gap: 11,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 39,
              height: 39,
              borderRadius: 13,
              background: `${accent}14`,
              color: accent,
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              fontSize: 17,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div
            style={{
              minWidth: 0,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize:
                  isMobile
                    ? 16
                    : 18,
                fontWeight: 900,
                color: "#0f172a",
                letterSpacing:
                  "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>

            {subtitle && (
              <p
                style={{
                  margin:
                    "4px 0 0",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: "#64748b",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function QuickActionTile({
  title,
  subtitle,
  body,
  onClick,
  accent,
  icon,
  isMobile,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        width: "100%",
        minWidth: 0,
        border:
          "1px solid #dbeafe",
        background:
          `linear-gradient(135deg, ${accent}10 0%, #ffffff 72%)`,
        borderRadius: 18,
        padding:
          isMobile
            ? 14
            : 16,
        cursor: "pointer",
        boxShadow:
          "0 9px 22px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
              color: "#64748b",
              fontWeight: 850,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 16,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {subtitle}
          </div>

          <p
            style={{
              margin:
                "7px 0 0",
              fontSize: 12,
              color: "#475569",
              lineHeight: 1.55,
            }}
          >
            {body}
          </p>
        </div>

        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: `${accent}16`,
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            fontSize: 19,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </button>
  );
}

function BirthdayRow({
  person,
  language,
  tag,
}) {
  const initials =
    getInitials(
      person.displayName
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap: 12,
        borderRadius: 15,
        padding: 12,
        background:
          "linear-gradient(135deg, #fdf2f8 0%, #ffffff 100%)",
        border:
          "1px solid #fbcfe8",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            overflow:
              "hidden",
            background:
              "#fce7f3",
            border:
              "1px solid #fbcfe8",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            color: "#9d174d",
            fontWeight: 850,
            flexShrink: 0,
          }}
        >
          {person.profilePhotoURL ? (
            <img
              src={
                person.profilePhotoURL
              }
              alt={
                person.displayName
              }
              style={{
                width: "100%",
                height: "100%",
                objectFit:
                  "cover",
              }}
            />
          ) : (
            <span>
              {initials}
            </span>
          )}
        </div>

        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 850,
              color: "#0f172a",
              wordBreak:
                "break-word",
            }}
          >
            {person.displayName}
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "#64748b",
            }}
          >
            {person.position}
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign:
            "right",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 850,
            color: "#be185d",
          }}
        >
          {formatBirthday(
            person.birthDateParsed,
            language
          )}
        </div>

        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            color: "#64748b",
          }}
        >
          {tag}
        </div>
      </div>
    </div>
  );
}

function LeaderRow({
  row,
  accent = "#1769aa",
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap: 12,
        borderRadius: 15,
        padding: 12,
        background:
          "linear-gradient(135deg, #edf7ff 0%, #ffffff 100%)",
        border:
          "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 11,
            background: `${accent}16`,
            color: accent,
            fontSize: 12,
            fontWeight: 850,
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            flexShrink: 0,
          }}
        >
          {row.rank}
        </div>

        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 850,
              color: "#0f172a",
            }}
          >
            {row.name}
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "#64748b",
            }}
          >
            {row.position}
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign:
            "right",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 900,
            color: accent,
          }}
        >
          {row.value}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "#64748b",
          }}
        >
          {row.label}
        </div>
      </div>
    </div>
  );
}

function RecognizedEmployeeCard({
  item,
  isMobile,
  language,
  onCongratulate,
}) {
  const writeText =
    language === "es"
      ? "Escribir felicitaci\u00F3n"
      : "Write congratulations";

  const monthText =
    language === "es"
      ? "Mes"
      : "Month";

  const departmentText =
    language === "es"
      ? "Departamento"
      : "Department";

  const positionText =
    language === "es"
      ? "Posici\u00F3n"
      : "Position";

  const airlineText =
    language === "es"
      ? "Aerol\u00EDnea"
      : "Airline";

  const initials =
    getInitials(
      item?.employeeName ||
        "E"
    );

  const profileImage =
    item?.photoURL ||
    item?.profilePhotoURL ||
    "";

  const canWrite =
    Boolean(
      item?.userId ||
        item?.username
    );

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, #ffffff 0%, #fffdf7 100%)",
        border:
          "1px solid #fde68a",
        borderRadius: 18,
        padding: 15,
        boxShadow:
          "0 10px 24px rgba(15,23,42,0.05)",
        display: "grid",
        gap: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: 11,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width:
              isMobile
                ? 54
                : 60,
            height:
              isMobile
                ? 54
                : 60,
            borderRadius: 17,
            overflow:
              "hidden",
            background:
              "#ffedd5",
            border:
              "1px solid #fdba74",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            color: "#9a3412",
            fontWeight: 900,
            fontSize: 19,
            flexShrink: 0,
          }}
        >
          {profileImage ? (
            <img
              src={profileImage}
              alt={
                item.employeeName
              }
              style={{
                width: "100%",
                height: "100%",
                objectFit:
                  "cover",
              }}
            />
          ) : (
            <span>
              {initials}
            </span>
          )}
        </div>

        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.2,
              wordBreak:
                "break-word",
            }}
          >
            {item.employeeName ||
              "\u2014"}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#9a3412",
              fontWeight: 800,
            }}
          >
            {item.position ||
              "\u2014"}
          </div>

          {item.username && (
            <div
              style={{
                marginTop: 3,
                fontSize: 11,
                color: "#64748b",
              }}
            >
              @{item.username}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: 7,
        }}
      >
        {[
          [
            positionText,
            item.position,
          ],
          [
            departmentText,
            item.department,
          ],
          [
            airlineText,
            item.airline,
          ],
          [
            monthText,
            item.monthLabel,
          ],
        ].map(
          ([label, value]) => (
            <div
              key={label}
              style={{
                borderRadius: 11,
                background:
                  "#fffdf7",
                border:
                  "1px solid #fde68a",
                padding:
                  "8px 9px",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 850,
                  color: "#64748b",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.05em",
                }}
              >
                {label}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 750,
                  color: "#0f172a",
                }}
              >
                {value ||
                  "\u2014"}
              </div>
            </div>
          )
        )}
      </div>

      {item.note && (
        <div
          style={{
            borderRadius: 11,
            background:
              "#fffdf7",
            border:
              "1px solid #fde68a",
            padding:
              "9px 11px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#475569",
              lineHeight: 1.55,
              whiteSpace:
                "pre-line",
            }}
          >
            {item.note}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          onCongratulate(item)
        }
        disabled={!canWrite}
        style={{
          border: "none",
          background: canWrite
            ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)"
            : "#cbd5e1",
          color: "#fff",
          borderRadius: 13,
          padding:
            "10px 12px",
          fontWeight: 850,
          fontSize: 12,
          cursor: canWrite
            ? "pointer"
            : "not-allowed",
          boxShadow: canWrite
            ? "0 10px 20px rgba(23,105,170,0.16)"
            : "none",
          opacity: canWrite
            ? 1
            : 0.8,
          width: "100%",
        }}
      >
        {writeText}
      </button>
    </div>
  );
}

function RecognizedEmployeesBanner({
  items,
  isMobile,
  language,
  onCongratulate,
}) {
  const title =
    language === "es"
      ? "Reconocimientos del Mes"
      : "Recognized Employees";

  const emptyText =
    language === "es"
      ? "No hay perfiles reconocidos."
      : "No recognized employees selected.";

  return (
    <section
      style={{
        background:
          "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
        border:
          "1px solid #fed7aa",
        borderRadius:
          isMobile
            ? 20
            : 24,
        padding:
          isMobile
            ? 15
            : 19,
        boxShadow:
          "0 16px 40px rgba(15,23,42,0.055)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: 11,
          marginBottom: 13,
        }}
      >
        <div
          style={{
            width: 39,
            height: 39,
            borderRadius: 13,
            background:
              "#f59e0b18",
            color: "#b45309",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          {"\u{1F3C6}"}
        </div>

        <div>
          <div
            style={{
              fontSize: 10,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
              color: "#b45309",
              fontWeight: 850,
            }}
          >
            {APP_NAME}
          </div>

          <h2
            style={{
              margin: "3px 0 0",
              fontSize:
                isMobile
                  ? 16
                  : 18,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing:
                "-0.02em",
            }}
          >
            {title}
          </h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          {emptyText}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(auto-fit, minmax(255px, 1fr))",
            gap: 12,
          }}
        >
          {items
            .slice(0, 6)
            .map((item) => (
              <RecognizedEmployeeCard
                key={item.id}
                item={item}
                isMobile={
                  isMobile
                }
                language={
                  language
                }
                onCongratulate={
                  onCongratulate
                }
              />
            ))}
        </div>
      )}
    </section>
  );
}

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const isMobile =
    useIsMobile(900);

  const [
    announcements,
    setAnnouncements,
  ] = useState([]);

  const [
    birthdays,
    setBirthdays,
  ] = useState([]);

  const [
    photos,
    setPhotos,
  ] = useState([]);

  const [
    wchrReports,
    setWchrReports,
  ] = useState([]);

  const [
    recognizedEmployees,
    setRecognizedEmployees,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    wchrLoading,
    setWchrLoading,
  ] = useState(true);

  const [
    language,
    setLanguage,
  ] = useState("en");

  const visibleName =
    useMemo(
      () =>
        getVisibleName(user),
      [user]
    );

  const visiblePosition =
    useMemo(
      () =>
        getVisiblePosition(user),
      [user]
    );

  const profilePhotoURL =
    user?.profilePhotoURL ||
    "";

  const copy = {
    en: {
      crewPortal:
        "Crew Portal",
      welcome:
        "Welcome back,",
      intro:
        "Your AeroStation Hub workspace for schedules, WCHR tools, messages and station updates.",
      quickActionsTitle:
        "Quick Access",
      quickActionsSubtitle:
        "Open the tools you use most.",
      stationHighlights:
        "Station Highlights",
      stationHighlightsSubtitle:
        "Recent moments from the station.",
      noHighlights:
        "No station highlights available.",
      quickActions: {
        myScheduleTitle:
          "Schedule",
        myScheduleSubtitle:
          "My Schedule",
        myScheduleBody:
          "Review your approved personalized work schedule.",
        messagesTitle:
          "Communication",
        messagesSubtitle:
          "Messages",
        messagesBody:
          "Open direct messages from your station team.",
        wchrScanTitle:
          "WCHR",
        wchrScanSubtitle:
          "Scan Boarding Pass",
        wchrScanBody:
          "Create a new WCHR report from a boarding pass scan.",
      },
      announcementsTitle:
        "Crew Announcements",
      announcementsSubtitle:
        "Current station information and notices.",
      announcementsEmpty:
        "No announcements available.",
      loading:
        "Loading dashboard...",
      latestAnnouncement:
        "Latest Announcement",
      latestAnnouncementSubtitle:
        "Most recent crew communication.",
      portalAccess:
        "Portal Access",
      modules: "Quick Tools",
      totalNews:
        "Announcements",
      birthdaysToday:
        "Today's Birthdays",
      birthdaysMonth:
        "This Month's Birthdays",
      birthdaysEmptyToday:
        "No birthdays today.",
      birthdaysEmptyMonth:
        "No birthdays this month.",
      birthdayTodayTag:
        "Today",
      birthdaySoonTag:
        "Coming up",
      wchrTopToday:
        "Top WCHR Today",
      wchrTopWeek:
        "Top WCHR This Week",
      topTodaySub:
        "Daily WCHR performance ranking.",
      topWeekSub:
        "Weekly WCHR performance ranking.",
      today:
        "WCHRs today",
      week:
        "WCHRs this week",
      loadingWchr:
        "Loading WCHR ranking...",
      congratsPrefix:
        "Congratulations",
      congratsBody:
        "You were selected for the recognition board this month. Great job and thank you for your hard work!",
      onlineWorkspace:
        "Operational workspace",
      currentUpdates:
        "Current updates",
    },

    es: {
      crewPortal:
        "Portal de Tripulaci\u00F3n",
      welcome:
        "Bienvenido(a),",
      intro:
        "Tu espacio de AeroStation Hub para horarios, herramientas WCHR, mensajes y actualizaciones de la estaci\u00F3n.",
      quickActionsTitle:
        "Accesos R\u00E1pidos",
      quickActionsSubtitle:
        "Abre las herramientas que m\u00E1s utilizas.",
      stationHighlights:
        "Momentos de la Estaci\u00F3n",
      stationHighlightsSubtitle:
        "Momentos recientes de la estaci\u00F3n.",
      noHighlights:
        "No hay fotos de la estaci\u00F3n disponibles.",
      quickActions: {
        myScheduleTitle:
          "Horario",
        myScheduleSubtitle:
          "Mi Horario",
        myScheduleBody:
          "Revisa tu horario de trabajo personalizado y aprobado.",
        messagesTitle:
          "Comunicaci\u00F3n",
        messagesSubtitle:
          "Mensajes",
        messagesBody:
          "Abre tus mensajes directos del equipo de la estaci\u00F3n.",
        wchrScanTitle:
          "WCHR",
        wchrScanSubtitle:
          "Escanear Boarding Pass",
        wchrScanBody:
          "Crea un nuevo reporte WCHR desde el escaneo del pase.",
      },
      announcementsTitle:
        "Anuncios de Tripulaci\u00F3n",
      announcementsSubtitle:
        "Informaci\u00F3n y avisos actuales de la estaci\u00F3n.",
      announcementsEmpty:
        "No hay anuncios disponibles.",
      loading:
        "Cargando dashboard...",
      latestAnnouncement:
        "\u00DAltimo Anuncio",
      latestAnnouncementSubtitle:
        "Comunicaci\u00F3n m\u00E1s reciente para el equipo.",
      portalAccess:
        "Acceso",
      modules:
        "Herramientas",
      totalNews:
        "Anuncios",
      birthdaysToday:
        "Cumplea\u00F1os de Hoy",
      birthdaysMonth:
        "Cumplea\u00F1os del Mes",
      birthdaysEmptyToday:
        "No hay cumplea\u00F1os hoy.",
      birthdaysEmptyMonth:
        "No hay cumplea\u00F1os este mes.",
      birthdayTodayTag:
        "Hoy",
      birthdaySoonTag:
        "Pr\u00F3ximo",
      wchrTopToday:
        "Top WCHR Hoy",
      wchrTopWeek:
        "Top WCHR Semana",
      topTodaySub:
        "Ranking diario de desempe\u00F1o WCHR.",
      topWeekSub:
        "Ranking semanal de desempe\u00F1o WCHR.",
      today:
        "WCHRs hoy",
      week:
        "WCHRs esta semana",
      loadingWchr:
        "Cargando ranking WCHR...",
      congratsPrefix:
        "Felicidades",
      congratsBody:
        "Fuiste seleccionado(a) para el mural de reconocimiento este mes. Gran trabajo y gracias por tu esfuerzo!",
      onlineWorkspace:
        "Espacio operacional",
      currentUpdates:
        "Actualizaciones actuales",
    },
  };

  const t = copy[language];

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const qAnnouncements =
          query(
            collection(
              db,
              "employeeAnnouncements"
            ),
            orderBy(
              "createdAt",
              "desc"
            )
          );

        const announcementsSnap =
          await getDocs(
            qAnnouncements
          );

        const announcementList =
          announcementsSnap.docs.map(
            (d) => ({
              id: d.id,
              ...d.data(),
            })
          );

        const sortedAnnouncements =
          announcementList.sort(
            (a, b) => {
              const aPinned =
                a.pinned
                  ? 1
                  : 0;

              const bPinned =
                b.pinned
                  ? 1
                  : 0;

              if (
                aPinned !==
                bPinned
              ) {
                return (
                  bPinned -
                  aPinned
                );
              }

              const aTime =
                a.createdAt
                  ?.seconds || 0;

              const bTime =
                b.createdAt
                  ?.seconds || 0;

              return (
                bTime -
                aTime
              );
            }
          );

        const todayStr =
          new Date()
            .toISOString()
            .slice(0, 10);

        const filteredAnnouncements =
          sortedAnnouncements.filter(
            (item) => {
              if (
                !item.expiresOn
              ) {
                return true;
              }

              return (
                item.expiresOn >=
                todayStr
              );
            }
          );

        setAnnouncements(
          filteredAnnouncements
        );

        const photosSnap =
          await getDocs(
            collection(
              db,
              "dashboard_photos"
            )
          );

        const photoList =
          photosSnap.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .sort((a, b) => {
              const aTime =
                a.createdAt
                  ?.seconds || 0;

              const bTime =
                b.createdAt
                  ?.seconds || 0;

              return (
                bTime -
                aTime
              );
            });

        setPhotos(photoList);

        const usersSnap =
          await getDocs(
            collection(
              db,
              "users"
            )
          );

        const birthdayList =
          usersSnap.docs
            .map((d) => {
              const data =
                d.data();

              const parsedDate =
                parseBirthDate(
                  data.birthDate
                );

              return {
                id: d.id,
                displayName:
                  data.displayName ||
                  data.fullName ||
                  data.name ||
                  data.username ||
                  "Team Member",
                position:
                  data.position ||
                  getDefaultPosition(
                    data.role
                  ),
                profilePhotoURL:
                  data.profilePhotoURL ||
                  "",
                birthDateParsed:
                  parsedDate,
                daysAway:
                  daysUntilBirthday(
                    parsedDate
                  ),
              };
            })
            .filter(
              (item) =>
                item.birthDateParsed
            );

        setBirthdays(
          birthdayList
        );

        try {
          const qRecognized =
            query(
              collection(
                db,
                "employee_of_month"
              ),
              where(
                "active",
                "==",
                true
              )
            );

          const recognizedSnap =
            await getDocs(
              qRecognized
            );

          const recognizedList =
            recognizedSnap.docs
              .map((d) => ({
                id: d.id,
                ...d.data(),
              }))
              .sort((a, b) => {
                const aTime =
                  a.createdAt
                    ?.seconds ||
                  0;

                const bTime =
                  b.createdAt
                    ?.seconds ||
                  0;

                return (
                  bTime -
                  aTime
                );
              });

          setRecognizedEmployees(
            recognizedList
          );
        } catch (err) {
          console.error(
            "Error loading recognized employees:",
            err
          );

          setRecognizedEmployees(
            []
          );
        }
      } catch (err) {
        console.error(
          "Error loading employee dashboard:",
          err
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData().catch(
      console.error
    );
  }, []);

  useEffect(() => {
    async function loadWchrReports() {
      try {
        setWchrLoading(true);

        const snap =
          await getDocs(
            collection(
              db,
              "wch_reports"
            )
          );

        const list =
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

        setWchrReports(list);
      } catch (err) {
        console.error(
          "Error loading WCHR reports:",
          err
        );

        setWchrReports([]);
      } finally {
        setWchrLoading(false);
      }
    }

    loadWchrReports().catch(
      console.error
    );
  }, []);

  const goTo = (path) =>
    navigate(path);

  const handleCongratulateRecognizedEmployee =
    (person) => {
      if (
        !person?.userId &&
        !person?.username
      ) {
        return;
      }

      const personName =
        person.employeeName ||
        "team member";

      const messageText =
        language === "es"
          ? `${t.congratsPrefix} ${personName}. ${t.congratsBody}`
          : `${t.congratsPrefix} ${personName}! ${t.congratsBody}`;

      navigate("/messages", {
        state: {
          recipientUserId:
            person.userId ||
            "",
          recipientUsername:
            person.username ||
            "",
          recipientName:
            person.employeeName ||
            "",
          prefilledMessage:
            messageText,
        },
      });
    };

  const quickCards =
    useMemo(
      () => [
        {
          title:
            t.quickActions
              .myScheduleTitle,
          subtitle:
            t.quickActions
              .myScheduleSubtitle,
          body:
            t.quickActions
              .myScheduleBody,
          onClick: () =>
            goTo(
              "/my-schedule"
            ),
          accent: "#1769aa",
          icon:
            "\u{1F4C5}",
        },
        {
          title:
            t.quickActions
              .messagesTitle,
          subtitle:
            t.quickActions
              .messagesSubtitle,
          body:
            t.quickActions
              .messagesBody,
          onClick: () =>
            goTo(
              "/messages"
            ),
          accent: "#7c3aed",
          icon:
            "\u{1F4AC}",
        },
        {
          title:
            t.quickActions
              .wchrScanTitle,
          subtitle:
            t.quickActions
              .wchrScanSubtitle,
          body:
            t.quickActions
              .wchrScanBody,
          onClick: () =>
            goTo(
              "/wchr/scan"
            ),
          accent: "#14b8a6",
          icon:
            "\u{1F3AB}",
        },
      ],
      [t]
    );

  const featuredAnnouncement =
    announcements[0] ||
    null;

  const todayBirthdays =
    useMemo(() => {
      const today =
        new Date();

      return birthdays.filter(
        (item) =>
          sameMonthAndDay(
            item.birthDateParsed,
            today
          )
      );
    }, [birthdays]);

  const monthBirthdays =
    useMemo(() => {
      const today =
        new Date();

      return birthdays
        .filter(
          (item) =>
            item.birthDateParsed?.getMonth() ===
            today.getMonth()
        )
        .sort(
          (a, b) =>
            a.birthDateParsed.getDate() -
            b.birthDateParsed.getDate()
        );
    }, [birthdays]);

  const topToday =
    useMemo(
      () => [
        getTopAgent(
          wchrReports,
          startOfToday(),
          t.today
        ),
      ],
      [
        wchrReports,
        t,
      ]
    );

  const topWeek =
    useMemo(
      () => [
        getTopAgent(
          wchrReports,
          startOfWeekMonday(),
          t.week
        ),
      ],
      [
        wchrReports,
        t,
      ]
    );

  const stats =
    useMemo(
      () => [
        {
          title:
            t.portalAccess,
          value:
            visiblePosition,
          subtitle:
            APP_NAME,
          accent:
            "#1769aa",
          icon:
            "\u{1F464}",
        },
        {
          title:
            t.modules,
          value:
            quickCards.length,
          subtitle:
            t.onlineWorkspace,
          accent:
            "#10b981",
          icon:
            "\u26A1",
        },
        {
          title:
            t.totalNews,
          value:
            announcements.length,
          subtitle:
            t.currentUpdates,
          accent:
            "#f59e0b",
          icon:
            "\u{1F4E3}",
        },
      ],
      [
        visiblePosition,
        quickCards.length,
        announcements.length,
        t,
      ]
    );

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        minHeight: "100%",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          background:
            "linear-gradient(135deg, #071c33 0%, #0f4c81 42%, #1769aa 72%, #62c4ef 100%)",
          borderRadius:
            isMobile
              ? 22
              : 30,
          padding:
            isMobile
              ? 18
              : 25,
          color: "#fff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
          position:
            "relative",
          overflow:
            "hidden",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width:
              isMobile
                ? 190
                : 260,
            height:
              isMobile
                ? 190
                : 260,
            borderRadius: 999,
            border:
              "1px solid rgba(255,255,255,0.08)",
            top:
              isMobile
                ? -100
                : -125,
            right:
              isMobile
                ? -55
                : -55,
            pointerEvents:
              "none",
          }}
        />

        <div
          style={{
            position:
              "absolute",
            width:
              isMobile
                ? 110
                : 160,
            height:
              isMobile
                ? 110
                : 160,
            borderRadius: 999,
            background:
              "rgba(255,255,255,0.05)",
            bottom: -65,
            right:
              isMobile
                ? 35
                : 150,
            pointerEvents:
              "none",
          }}
        />

        <div
          style={{
            position:
              "relative",
            display: "flex",
            alignItems:
              "flex-start",
            justifyContent:
              "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "flex-start",
              gap:
                isMobile
                  ? 12
                  : 14,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width:
                  isMobile
                    ? 60
                    : 70,
                height:
                  isMobile
                    ? 60
                    : 70,
                borderRadius:
                  isMobile
                    ? 18
                    : 21,
                overflow:
                  "hidden",
                background:
                  "rgba(255,255,255,0.12)",
                border:
                  "1px solid rgba(255,255,255,0.16)",
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                color: "#fff",
                fontSize:
                  isMobile
                    ? 20
                    : 23,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {profilePhotoURL ? (
                <img
                  src={
                    profilePhotoURL
                  }
                  alt={
                    visibleName
                  }
                  style={{
                    width:
                      "100%",
                    height:
                      "100%",
                    objectFit:
                      "cover",
                  }}
                />
              ) : (
                <span>
                  {getInitials(
                    visibleName
                  )}
                </span>
              )}
            </div>

            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.16em",
                  color:
                    "rgba(255,255,255,0.68)",
                  fontWeight: 850,
                }}
              >
                {APP_NAME}{" "}
                {"\u00B7"}{" "}
                {t.crewPortal}
              </div>

              <h1
                style={{
                  margin:
                    "7px 0 5px",
                  fontSize:
                    isMobile
                      ? 24
                      : 32,
                  lineHeight: 1.08,
                  fontWeight: 900,
                  letterSpacing:
                    "-0.04em",
                  wordBreak:
                    "break-word",
                }}
              >
                {t.welcome}{" "}
                {visibleName}
              </h1>

              <div
                style={{
                  display: "flex",
                  gap: 7,
                  flexWrap:
                    "wrap",
                  alignItems:
                    "center",
                }}
              >
                <span
                  style={{
                    padding:
                      "5px 8px",
                    borderRadius:
                      999,
                    background:
                      "rgba(255,255,255,0.12)",
                    border:
                      "1px solid rgba(255,255,255,0.14)",
                    fontSize:
                      10.5,
                    fontWeight:
                      800,
                  }}
                >
                  {visiblePosition}
                </span>

                <span
                  style={{
                    padding:
                      "5px 8px",
                    borderRadius:
                      999,
                    background:
                      "rgba(255,255,255,0.08)",
                    border:
                      "1px solid rgba(255,255,255,0.12)",
                    fontSize:
                      10.5,
                    color:
                      "rgba(255,255,255,0.8)",
                  }}
                >
                  @
                  {user?.username ||
                    "user"}
                </span>
              </div>

              <p
                style={{
                  margin:
                    "10px 0 0",
                  maxWidth: 720,
                  fontSize:
                    isMobile
                      ? 12
                      : 13,
                  lineHeight: 1.55,
                  color:
                    "rgba(255,255,255,0.82)",
                }}
              >
                {t.intro}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 7,
              width:
                isMobile
                  ? "100%"
                  : "auto",
              justifyContent:
                isMobile
                  ? "flex-start"
                  : "flex-end",
              flexWrap: "wrap",
            }}
          >
            <HeroButton
              onClick={() =>
                setLanguage("en")
              }
              active={
                language === "en"
              }
            >
              EN
            </HeroButton>

            <HeroButton
              onClick={() =>
                setLanguage("es")
              }
              active={
                language === "es"
              }
            >
              ES
            </HeroButton>
          </div>
        </div>

        <div
          style={{
            position:
              "relative",
            marginTop: 15,
            borderRadius: 16,
            padding:
              isMobile
                ? "11px 12px"
                : "12px 14px",
            background:
              "rgba(255,255,255,0.09)",
            border:
              "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color:
                "rgba(255,255,255,0.7)",
              fontWeight: 750,
            }}
          >
            {APP_SUBTITLE}
          </div>

          <div
            style={{
              fontSize: 10,
              color:
                "rgba(255,255,255,0.56)",
              fontWeight: 700,
            }}
          >
            Update 1.7
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(3, minmax(0, 1fr))",
          gap:
            isMobile
              ? 9
              : 13,
          marginBottom: 16,
        }}
      >
        {stats.map(
          (item) => (
            <StatCard
              key={item.title}
              {...item}
              isMobile={
                isMobile
              }
            />
          )
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "1fr"
              : "minmax(0, 1.55fr) minmax(310px, 0.95fr)",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            minWidth: 0,
          }}
        >
          <GlassCard
            title={
              t.quickActionsTitle
            }
            subtitle={
              t.quickActionsSubtitle
            }
            icon={"\u26A1"}
            accent="#1769aa"
            isMobile={isMobile}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              {quickCards.map(
                (card) => (
                  <QuickActionTile
                    key={
                      card.subtitle
                    }
                    {...card}
                    isMobile={
                      isMobile
                    }
                  />
                )
              )}
            </div>
          </GlassCard>

          <RecognizedEmployeesBanner
            items={
              recognizedEmployees
            }
            isMobile={isMobile}
            language={language}
            onCongratulate={
              handleCongratulateRecognizedEmployee
            }
          />

          <GlassCard
            title={
              t.stationHighlights
            }
            subtitle={
              t.stationHighlightsSubtitle
            }
            icon={"\u2708\uFE0F"}
            accent="#5aa9e6"
            isMobile={isMobile}
            action={
              photos.length >
              0 ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 750,
                    color: "#64748b",
                  }}
                >
                  {photos.length}{" "}
                  photo
                  {photos.length !==
                  1
                    ? "s"
                    : ""}
                </span>
              ) : null
            }
          >
            {loading ? (
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                }}
              >
                {t.loading}
              </p>
            ) : photos.length ===
              0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                }}
              >
                {t.noHighlights}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "repeat(auto-fit, minmax(165px, 1fr))",
                  gap: 10,
                }}
              >
                {photos
                  .slice(0, 6)
                  .map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background:
                          "#fff",
                        border:
                          "1px solid #e0f2fe",
                        borderRadius:
                          16,
                        overflow:
                          "hidden",
                        boxShadow:
                          "0 10px 22px rgba(15,23,42,0.045)",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          aspectRatio:
                            "4 / 3",
                          background:
                            "#e2e8f0",
                        }}
                      >
                        <img
                          src={
                            p.url
                          }
                          alt={
                            p.caption ||
                            "Station highlight"
                          }
                          style={{
                            width:
                              "100%",
                            height:
                              "100%",
                            objectFit:
                              "cover",
                            display:
                              "block",
                          }}
                        />
                      </div>

                      {p.caption && (
                        <div
                          style={{
                            padding:
                              10,
                          }}
                        >
                          <p
                            style={{
                              margin:
                                0,
                              fontSize:
                                11.5,
                              fontWeight:
                                650,
                              color:
                                "#475569",
                              wordBreak:
                                "break-word",
                            }}
                          >
                            {
                              p.caption
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </GlassCard>

          {!loading &&
            featuredAnnouncement && (
              <GlassCard
                title={
                  t.latestAnnouncement
                }
                subtitle={
                  t.latestAnnouncementSubtitle
                }
                icon={"\u{1F4E2}"}
                accent="#1f7cc1"
                isMobile={
                  isMobile
                }
              >
                <div
                  style={{
                    borderRadius:
                      16,
                    overflow:
                      "hidden",
                    background:
                      "linear-gradient(135deg, #edf7ff 0%, #ffffff 100%)",
                    border:
                      "1px solid #d6ebff",
                  }}
                >
                  <div
                    style={{
                      padding:
                        isMobile
                          ? 13
                          : 15,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize:
                          isMobile
                            ? 16
                            : 18,
                        fontWeight:
                          900,
                        color:
                          "#0f172a",
                      }}
                    >
                      {featuredAnnouncement.title ||
                        "Announcement"}
                    </h3>

                    {featuredAnnouncement.subtitle && (
                      <p
                        style={{
                          margin:
                            "6px 0 0",
                          fontSize:
                            12,
                          fontWeight:
                            750,
                          color:
                            "#1769aa",
                        }}
                      >
                        {
                          featuredAnnouncement.subtitle
                        }
                      </p>
                    )}

                    {featuredAnnouncement.body && (
                      <p
                        style={{
                          margin:
                            "9px 0 0",
                          fontSize:
                            13,
                          color:
                            "#334155",
                          lineHeight:
                            1.65,
                          whiteSpace:
                            "pre-line",
                        }}
                      >
                        {
                          featuredAnnouncement.body
                        }
                      </p>
                    )}

                    <div
                      style={{
                        marginTop:
                          9,
                        fontSize:
                          10.5,
                        color:
                          "#64748b",
                        fontWeight:
                          750,
                      }}
                    >
                      By {APP_NAME}
                    </div>
                  </div>

                  {featuredAnnouncement.imageUrl && (
                    <div
                      style={{
                        borderTop:
                          "1px solid #dbeafe",
                        background:
                          "#fff",
                      }}
                    >
                      <img
                        src={
                          featuredAnnouncement.imageUrl
                        }
                        alt={
                          featuredAnnouncement.title ||
                          "Announcement"
                        }
                        style={{
                          width:
                            "100%",
                          maxHeight:
                            320,
                          objectFit:
                            "cover",
                          display:
                            "block",
                        }}
                      />
                    </div>
                  )}
                </div>
              </GlassCard>
            )}

          <GlassCard
            title={
              t.announcementsTitle
            }
            subtitle={
              t.announcementsSubtitle
            }
            icon={"\u{1F4CC}"}
            accent="#f59e0b"
            isMobile={isMobile}
          >
            {loading ? (
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                }}
              >
                {t.loading}
              </p>
            ) : announcements.length ===
              0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                }}
              >
                {t.announcementsEmpty}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                }}
              >
                {announcements
                  .slice(0, 6)
                  .map((item) => (
                    <div
                      key={
                        item.id
                      }
                      style={{
                        borderRadius:
                          15,
                        padding:
                          12,
                        background:
                          "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                        border:
                          "1px solid #fde68a",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          gap: 6,
                          flexWrap:
                            "wrap",
                          marginBottom:
                            6,
                        }}
                      >
                        {item.pinned && (
                          <span
                            style={{
                              padding:
                                "4px 7px",
                              borderRadius:
                                999,
                              background:
                                "#dbeafe",
                              border:
                                "1px solid #bfdbfe",
                              color:
                                "#1d4ed8",
                              fontSize:
                                9.5,
                              fontWeight:
                                850,
                              textTransform:
                                "uppercase",
                            }}
                          >
                            Pinned
                          </span>
                        )}

                        {item.category && (
                          <span
                            style={{
                              padding:
                                "4px 7px",
                              borderRadius:
                                999,
                              background:
                                "#fff7ed",
                              border:
                                "1px solid #fed7aa",
                              color:
                                "#9a3412",
                              fontSize:
                                9.5,
                              fontWeight:
                                850,
                              textTransform:
                                "uppercase",
                            }}
                          >
                            {
                              item.category
                            }
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontWeight:
                            850,
                          color:
                            "#0f172a",
                          fontSize:
                            13.5,
                        }}
                      >
                        {item.title ||
                          "Announcement"}
                      </p>

                      {item.subtitle && (
                        <p
                          style={{
                            margin:
                              "5px 0 0",
                            fontSize:
                              11,
                            color:
                              "#b45309",
                            fontWeight:
                              750,
                          }}
                        >
                          {
                            item.subtitle
                          }
                        </p>
                      )}

                      {item.body && (
                        <p
                          style={{
                            margin:
                              "7px 0 0",
                            fontSize:
                              12,
                            color:
                              "#475569",
                            lineHeight:
                              1.55,
                            whiteSpace:
                              "pre-line",
                          }}
                        >
                          {
                            item.body
                          }
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </GlassCard>
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
            minWidth: 0,
            alignContent:
              "start",
          }}
        >
          <GlassCard
            title={
              t.birthdaysToday
            }
            icon={"\u{1F382}"}
            accent="#ec4899"
            isMobile={isMobile}
          >
            {todayBirthdays.length ===
            0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 12.5,
                }}
              >
                {t.birthdaysEmptyToday}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                }}
              >
                {todayBirthdays.map(
                  (person) => (
                    <BirthdayRow
                      key={
                        person.id
                      }
                      person={
                        person
                      }
                      language={
                        language
                      }
                      tag={
                        t.birthdayTodayTag
                      }
                    />
                  )
                )}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={
              t.birthdaysMonth
            }
            icon={"\u{1F389}"}
            accent="#db2777"
            isMobile={isMobile}
          >
            {monthBirthdays.length ===
            0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 12.5,
                }}
              >
                {t.birthdaysEmptyMonth}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                }}
              >
                {monthBirthdays
                  .slice(0, 6)
                  .map(
                    (
                      person
                    ) => (
                      <BirthdayRow
                        key={
                          person.id
                        }
                        person={
                          person
                        }
                        language={
                          language
                        }
                        tag={
                          person.daysAway ===
                          0
                            ? t.birthdayTodayTag
                            : `${t.birthdaySoonTag}: ${person.daysAway}d`
                        }
                      />
                    )
                  )}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={
              t.wchrTopToday
            }
            icon={"\u267F"}
            accent="#0ea5e9"
            isMobile={isMobile}
          >
            <p
              style={{
                margin:
                  "0 0 10px",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              {t.topTodaySub}
            </p>

            {wchrLoading ? (
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                  fontSize: 12,
                }}
              >
                {t.loadingWchr}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                }}
              >
                {topToday.map(
                  (row) => (
                    <LeaderRow
                      key={`${row.name}-${row.rank}`}
                      row={
                        row
                      }
                      accent="#0ea5e9"
                    />
                  )
                )}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title={
              t.wchrTopWeek
            }
            icon={"\u{1F4CA}"}
            accent="#10b981"
            isMobile={isMobile}
          >
            <p
              style={{
                margin:
                  "0 0 10px",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              {t.topWeekSub}
            </p>

            {wchrLoading ? (
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                  fontSize: 12,
                }}
              >
                {t.loadingWchr}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                }}
              >
                {topWeek.map(
                  (row) => (
                    <LeaderRow
                      key={`${row.name}-${row.rank}`}
                      row={
                        row
                      }
                      accent="#10b981"
                    />
                  )
                )}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 10,
          padding:
            "16px 0 5px",
        }}
      >
        {APP_NAME}{" "}
        {"\u00B7"}{" "}
        {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END EmployeeDashboardPage
