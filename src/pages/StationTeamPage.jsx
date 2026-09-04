import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// IMPORTANT:
// Special punctuation and symbols use Unicode escape sequences to reduce
// encoding issues when editing through GitHub/Safari/iPad.

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(person) {
  return (
    person?.displayName ||
    person?.fullName ||
    person?.name ||
    person?.employeeName ||
    person?.username ||
    "Unnamed"
  );
}

function getInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "U";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const value = normalizeLower(role);
  if (value === "station manager") return "station_manager";
  if (value === "duty manager") return "duty_manager";
  return value;
}

function getPersonPhoto(person) {
  return (
    person?.profilePhotoURL ||
    person?.photoURL ||
    person?.photoUrl ||
    person?.profilePhotoUrl ||
    ""
  );
}

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function RoleBadge({ role }) {
  const key = normalizeRole(role);

  const config =
    key === "station_manager"
      ? { label: "Station Manager", bg: "#dbeafe", color: "#0f4c81", border: "#bfdbfe" }
      : key === "duty_manager"
      ? { label: "Duty Manager", bg: "#ede9fe", color: "#6d28d9", border: "#ddd6fe" }
      : key === "supervisor"
      ? { label: "Supervisor", bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" }
      : { label: "Agent", bg: "#f8fafc", color: "#475569", border: "#e2e8f0" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "5px 9px",
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        fontSize: 10,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

function PersonCard({ person, featured = false, compact = false }) {
  const visibleName = getVisibleName(person);
  const position = person.position || getDefaultPosition(person.role);
  const airline = normalizeText(person.airline);
  const department = normalizeText(person.department);
  const photo = getPersonPhoto(person);

  const size = featured ? 86 : compact ? 54 : 66;

  return (
    <div
      style={{
        minWidth: 0,
        background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
        border: featured ? "1px solid #bfdbfe" : "1px solid #dbeafe",
        borderRadius: featured ? 24 : 20,
        padding: featured ? 18 : compact ? 12 : 14,
        boxShadow: featured
          ? "0 18px 42px rgba(15,76,129,0.14)"
          : "0 10px 24px rgba(15,23,42,0.05)",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top right, rgba(90,169,230,0.12), transparent 34%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "999px",
            overflow: "hidden",
            background: "#e0f2fe",
            border: featured ? "3px solid #ffffff" : "2px solid #ffffff",
            outline: featured ? "2px solid #93c5fd" : "1px solid #bae6fd",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0f4c81",
            fontWeight: 850,
            fontSize: featured ? 26 : compact ? 17 : 20,
            boxShadow: "0 8px 18px rgba(15,76,129,0.12)",
          }}
        >
          {photo ? (
            <img
              src={photo}
              alt={visibleName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <span>{getInitials(visibleName)}</span>
          )}
        </div>

        <div
          style={{
            marginTop: compact ? 9 : 12,
            fontSize: featured ? 17 : compact ? 12.5 : 14,
            fontWeight: 850,
            color: "#0f172a",
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {visibleName}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: featured ? 12.5 : 11.5,
            fontWeight: 800,
            color: "#1769aa",
            lineHeight: 1.3,
          }}
        >
          {position}
        </div>

        <div style={{ marginTop: 7 }}>
          <RoleBadge role={person.role} />
        </div>

        {(airline || department) && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10.5,
              color: "#64748b",
              lineHeight: 1.45,
              minHeight: 30,
            }}
          >
            {airline || "No Airline"}
            {"\u00B7"}
            <br />
            {department || "No Department"}
          </div>
        )}

        {person.username && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: "#94a3b8",
            }}
          >
            @{person.username}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorLine({ height = 30 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 2,
        height,
        margin: "0 auto",
        background: "linear-gradient(180deg, #60a5fa 0%, #cbd5e1 100%)",
        borderRadius: 999,
      }}
    />
  );
}

function TierHeader({ label, count, accent = "#1769aa" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          padding: "7px 12px",
          background: `${accent}12`,
          border: `1px solid ${accent}28`,
          color: accent,
          fontSize: 11,
          fontWeight: 850,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: "#ffffff",
          border: "1px solid #dbeafe",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#475569",
          fontSize: 10,
          fontWeight: 850,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function OrgTier({ label, people, accent, featured = false, compact = false, isMobile }) {
  if (!people.length) return null;

  return (
    <div style={{ position: "relative" }}>
      <TierHeader label={label} count={people.length} accent={accent} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? featured
              ? "minmax(0, 320px)"
              : "repeat(2, minmax(0, 1fr))"
            : featured
            ? "minmax(280px, 340px)"
            : compact
            ? "repeat(auto-fit, minmax(150px, 1fr))"
            : "repeat(auto-fit, minmax(190px, 1fr))",
          justifyContent: "center",
          gap: isMobile ? 10 : 14,
          maxWidth: featured ? 360 : "100%",
          margin: "0 auto",
        }}
      >
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            featured={featured}
            compact={compact || isMobile}
          />
        ))}
      </div>
    </div>
  );
}

function DepartmentLane({ department, people, isMobile }) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid #dbeafe",
        background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
        padding: isMobile ? 12 : 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 850,
            color: "#0f4c81",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {department}
        </div>

        <div
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "#ffffff",
            border: "1px solid #dbeafe",
            color: "#64748b",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {people.length}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 10,
        }}
      >
        {people.map((person) => (
          <PersonCard key={person.id} person={person} compact />
        ))}
      </div>
    </div>
  );
}

function DepartmentGrid({ title, groups, isMobile }) {
  const entries = Object.entries(groups).filter(([, list]) => list.length > 0);
  if (!entries.length) return null;

  return (
    <div>
      <TierHeader
        label={title}
        count={entries.reduce((sum, [, list]) => sum + list.length, 0)}
        accent={title === "Supervisors" ? "#059669" : "#64748b"}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
        }}
      >
        {entries.map(([department, list]) => (
          <DepartmentLane
            key={department}
            department={department}
            people={list}
            isMobile={isMobile}
          />
        ))}
      </div>
    </div>
  );
}

export default function StationTeamPage() {
  const isMobile = useIsMobile(900);

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  useEffect(() => {
    async function loadTeam() {
      try {
        setLoading(true);
        setError("");

        const [usersSnap, employeesSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employees")),
        ]);

        const users = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const employees = employeesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const usersByEmployeeId = new Map();
        const usersByUsername = new Map();

        users.forEach((usr) => {
          const employeeIdKey = normalizeText(usr.employeeId);
          const usernameKey = normalizeLower(usr.username || usr.loginUsername);

          if (employeeIdKey) {
            usersByEmployeeId.set(employeeIdKey, usr);
          }

          if (usernameKey) {
            usersByUsername.set(usernameKey, usr);
          }
        });

        const mergedFromEmployees = employees.map((emp) => {
          const empIdKey = normalizeText(emp.id);
          const loginKey = normalizeLower(emp.loginUsername);

          const matchedUser =
            usersByEmployeeId.get(empIdKey) ||
            usersByUsername.get(loginKey) ||
            null;

          const role = normalizeRole(
            matchedUser?.role || emp?.role || "agent"
          );

          return {
            id: `employee-${emp.id}`,
            sourceEmployeeId: emp.id,
            sourceUserId: matchedUser?.id || "",
            role,
            username:
              matchedUser?.username ||
              matchedUser?.loginUsername ||
              emp?.loginUsername ||
              "",
            displayName:
              matchedUser?.displayName ||
              matchedUser?.fullName ||
              matchedUser?.name ||
              emp?.name ||
              "",
            fullName:
              matchedUser?.fullName ||
              matchedUser?.displayName ||
              emp?.name ||
              "",
            name: emp?.name || matchedUser?.name || "",
            employeeName: emp?.name || "",
            airline: emp?.airline || matchedUser?.airline || "",
            department: emp?.department || matchedUser?.department || "",
            position:
              emp?.position ||
              matchedUser?.position ||
              getDefaultPosition(role),
            profilePhotoURL:
              matchedUser?.profilePhotoURL ||
              emp?.profilePhotoURL ||
              "",
            active:
              emp?.active === false
                ? false
                : String(emp?.status || "Active").toLowerCase() !== "inactive",
          };
        });

        const linkedEmployeeIds = new Set(
          mergedFromEmployees.map((item) => normalizeText(item.sourceEmployeeId))
        );
        const linkedUserIds = new Set(
          mergedFromEmployees
            .map((item) => normalizeText(item.sourceUserId))
            .filter(Boolean)
        );

        const extraUsersWithoutEmployee = users
          .filter((usr) => {
            const userIdKey = normalizeText(usr.id);
            const employeeIdKey = normalizeText(usr.employeeId);

            if (linkedUserIds.has(userIdKey)) return false;
            if (employeeIdKey && linkedEmployeeIds.has(employeeIdKey)) return false;

            return true;
          })
          .map((usr) => {
            const role = normalizeRole(usr?.role || "agent");

            return {
              id: `user-${usr.id}`,
              sourceEmployeeId: normalizeText(usr.employeeId),
              sourceUserId: usr.id,
              role,
              username: usr?.username || usr?.loginUsername || "",
              displayName:
                usr?.displayName ||
                usr?.fullName ||
                usr?.name ||
                usr?.username ||
                "",
              fullName:
                usr?.fullName ||
                usr?.displayName ||
                usr?.name ||
                "",
              name: usr?.name || usr?.displayName || usr?.username || "",
              employeeName: "",
              airline: usr?.airline || "",
              department: usr?.department || "",
              position: usr?.position || getDefaultPosition(role),
              profilePhotoURL: usr?.profilePhotoURL || "",
              active: true,
            };
          });

        const finalList = [...mergedFromEmployees, ...extraUsersWithoutEmployee]
          .filter((item) => item.active !== false)
          .filter(
            (item) =>
              normalizeText(item.displayName) ||
              normalizeText(item.employeeName) ||
              normalizeText(item.username)
          );

        setPeople(finalList);
      } catch (err) {
        console.error("Error loading station team:", err);
        setPeople([]);
        setError("Unable to load the station team right now.");
      } finally {
        setLoading(false);
      }
    }

    loadTeam().catch(console.error);
  }, []);

  const departments = useMemo(() => {
    const values = new Set();

    people.forEach((person) => {
      const department = normalizeText(person.department);
      if (department) values.add(department);
    });

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filteredPeople = useMemo(() => {
    const searchKey = normalizeLower(search);

    return people.filter((person) => {
      const department = normalizeText(person.department) || "No Department";

      if (
        departmentFilter !== "ALL" &&
        department !== departmentFilter
      ) {
        return false;
      }

      if (!searchKey) return true;

      const haystack = [
        getVisibleName(person),
        person.username,
        person.position,
        person.department,
        person.airline,
        getDefaultPosition(person.role),
      ]
        .map(normalizeLower)
        .join(" ");

      return haystack.includes(searchKey);
    });
  }, [people, search, departmentFilter]);

  const sortedPeople = useMemo(() => {
    return [...filteredPeople].sort((a, b) =>
      getVisibleName(a).localeCompare(getVisibleName(b))
    );
  }, [filteredPeople]);

  const stationManagers = useMemo(() => {
    return sortedPeople.filter(
      (p) => normalizeRole(p.role) === "station_manager"
    );
  }, [sortedPeople]);

  const dutyManagers = useMemo(() => {
    return sortedPeople.filter(
      (p) => normalizeRole(p.role) === "duty_manager"
    );
  }, [sortedPeople]);

  const supervisorsGrouped = useMemo(() => {
    const rows = sortedPeople.filter(
      (p) => normalizeRole(p.role) === "supervisor"
    );

    const grouped = {};
    rows.forEach((person) => {
      const department = normalizeText(person.department) || "No Department";
      if (!grouped[department]) grouped[department] = [];
      grouped[department].push(person);
    });

    return Object.fromEntries(
      Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))
    );
  }, [sortedPeople]);

  const agentsGrouped = useMemo(() => {
    const rows = sortedPeople.filter(
      (p) => normalizeRole(p.role) === "agent"
    );

    const grouped = {};
    rows.forEach((person) => {
      const department = normalizeText(person.department) || "No Department";
      if (!grouped[department]) grouped[department] = [];
      grouped[department].push(person);
    });

    return Object.fromEntries(
      Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))
    );
  }, [sortedPeople]);

  const summary = useMemo(() => {
    return {
      total: people.length,
      managers: people.filter((p) =>
        ["station_manager", "duty_manager"].includes(normalizeRole(p.role))
      ).length,
      supervisors: people.filter(
        (p) => normalizeRole(p.role) === "supervisor"
      ).length,
      agents: people.filter(
        (p) => normalizeRole(p.role) === "agent"
      ).length,
    };
  }, [people]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 44%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 18 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(15,76,129,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.09)",
            top: -120,
            right: -55,
          }}
        />

        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.05)",
            bottom: -110,
            left: "28%",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: 18,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <div
              style={{
                width: isMobile ? 52 : 62,
                height: isMobile ? 52 : 62,
                borderRadius: 18,
                overflow: "hidden",
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.84)",
                flexShrink: 0,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.72)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Organization Directory
              </div>

              <h1
                style={{
                  margin: "6px 0 4px",
                  fontSize: isMobile ? 24 : 34,
                  lineHeight: 1.05,
                  fontWeight: 850,
                  letterSpacing: "-0.04em",
                }}
              >
                Station Team
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: 760,
                  fontSize: isMobile ? 12.5 : 13.5,
                  color: "rgba(255,255,255,0.86)",
                  lineHeight: 1.5,
                }}
              >
                Interactive organization view for station leadership, supervisors,
                departments, and operational teams.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(90px, 1fr))",
              gap: 8,
              width: isMobile ? "100%" : 250,
            }}
          >
            {[
              ["Team", summary.total],
              ["Managers", summary.managers],
              ["Supervisors", summary.supervisors],
              ["Agents", summary.agents],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  borderRadius: 15,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", fontWeight: 750 }}>
                  {label}
                </div>
                <div style={{ marginTop: 2, fontSize: 20, fontWeight: 850 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PageCard
        style={{
          padding: isMobile ? 14 : 16,
          position: "sticky",
          top: 8,
          zIndex: 20,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 1fr) 240px",
            gap: 10,
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, role, department or airline..."
            style={{
              width: "100%",
              border: "1px solid #dbeafe",
              background: "#ffffff",
              borderRadius: 14,
              padding: "11px 13px",
              fontSize: 16,
              color: "#0f172a",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #dbeafe",
              background: "#ffffff",
              borderRadius: 14,
              padding: "11px 13px",
              fontSize: 16,
              color: "#0f172a",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="ALL">All Departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </div>
      </PageCard>

      {loading ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            Loading team structure...
          </p>
        </PageCard>
      ) : error ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#be123c",
              fontSize: 14,
              fontWeight: 750,
            }}
          >
            {error}
          </p>
        </PageCard>
      ) : filteredPeople.length === 0 ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            No team members match the current filters.
          </p>
        </PageCard>
      ) : (
        <PageCard
          style={{
            padding: isMobile ? 14 : 22,
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(248,251,255,0.96) 0%, rgba(255,255,255,0.96) 100%)",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "grid",
              gap: 0,
            }}
          >
            <OrgTier
              label="Station Leadership"
              people={stationManagers}
              accent="#1769aa"
              featured
              isMobile={isMobile}
            />

            {stationManagers.length > 0 && dutyManagers.length > 0 && (
              <ConnectorLine height={34} />
            )}

            <OrgTier
              label="Duty Management"
              people={dutyManagers}
              accent="#7c3aed"
              isMobile={isMobile}
            />

            {dutyManagers.length > 0 &&
              Object.keys(supervisorsGrouped).length > 0 && (
                <ConnectorLine height={34} />
              )}

            <DepartmentGrid
              title="Supervisors"
              groups={supervisorsGrouped}
              isMobile={isMobile}
            />

            {Object.keys(supervisorsGrouped).length > 0 &&
              Object.keys(agentsGrouped).length > 0 && (
                <ConnectorLine height={34} />
              )}

            <DepartmentGrid
              title="Agents"
              groups={agentsGrouped}
              isMobile={isMobile}
            />
          </div>
        </PageCard>
      )}

      <div
        style={{
          textAlign: "center",
          padding: "4px 10px 10px",
          color: "#94a3b8",
          fontSize: 10.5,
          lineHeight: 1.5,
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END StationTeamPage
