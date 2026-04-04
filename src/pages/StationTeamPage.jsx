import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
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

function normalizeNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function PersonCard({ person, large = false }) {
  const visibleName = getVisibleName(person);
  const position = person.position || getDefaultPosition(person.role);
  const department = normalizeText(person.department);
  const photo = person.profilePhotoURL || "";

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: large ? 22 : 18,
        padding: large ? 18 : 14,
        boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: large ? 64 : 54,
            height: large ? 64 : 54,
            borderRadius: large ? 20 : 16,
            overflow: "hidden",
            background: "#e0f2fe",
            border: "1px solid #bae6fd",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0f4c81",
            fontWeight: 800,
            fontSize: large ? 22 : 18,
            flexShrink: 0,
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

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: large ? 18 : 15,
              fontWeight: 800,
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
              fontSize: 13,
              fontWeight: 700,
              color: "#1769aa",
            }}
          >
            {position}
          </div>

          {department && (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              {department}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupSection({ title, people, large = false }) {
  if (!people.length) return null;

  return (
    <PageCard style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#64748b",
          }}
        >
          {people.length} team member{people.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: large
            ? "minmax(280px, 420px)"
            : "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 14,
        }}
      >
        {people.map((person) => (
          <PersonCard key={person.id} person={person} large={large} />
        ))}
      </div>
    </PageCard>
  );
}

function GroupedDepartmentSection({ title, groups }) {
  const entries = Object.entries(groups).filter(([, list]) => list.length > 0);
  if (!entries.length) return null;

  return (
    <PageCard style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {entries.map(([groupName, list]) => (
          <div key={groupName}>
            <div
              style={{
                marginBottom: 10,
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 999,
                background: "#edf7ff",
                border: "1px solid #cfe7fb",
                color: "#1769aa",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {groupName}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 14,
              }}
            >
              {list.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageCard>
  );
}

export default function StationTeamPage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTeam() {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const employeesSnap = await getDocs(collection(db, "employees"));

        const employees = employeesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const users = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const employeesByLogin = new Map();
        const employeesById = new Map();
        const employeesByName = new Map();

        employees.forEach((emp) => {
          const loginUsername = normalizeLower(emp.loginUsername);
          if (loginUsername) {
            employeesByLogin.set(loginUsername, emp);
          }

          employeesById.set(emp.id, emp);

          const empNameKey = normalizeNameKey(emp.name);
          if (empNameKey && !employeesByName.has(empNameKey)) {
            employeesByName.set(empNameKey, emp);
          }
        });

        const merged = users.map((usr) => {
          const username = normalizeLower(usr.username);

          const userDisplayNameKey = normalizeNameKey(usr.displayName);
          const userFullNameKey = normalizeNameKey(usr.fullName);
          const userNameKey = normalizeNameKey(usr.name);

          const empById = usr.employeeId ? employeesById.get(usr.employeeId) : null;
          const empByLogin = employeesByLogin.get(username);
          const empByDisplayName = userDisplayNameKey
            ? employeesByName.get(userDisplayNameKey)
            : null;
          const empByFullName = userFullNameKey
            ? employeesByName.get(userFullNameKey)
            : null;
          const empByName = userNameKey ? employeesByName.get(userNameKey) : null;

          const emp =
            empById ||
            empByLogin ||
            empByDisplayName ||
            empByFullName ||
            empByName ||
            null;

          return {
            id: usr.id,
            ...usr,
            employeeName: emp?.name || "",
            department: emp?.department || usr?.department || "",
            position:
              emp?.position ||
              usr?.position ||
              getDefaultPosition(usr?.role),
            profilePhotoURL: usr?.profilePhotoURL || emp?.profilePhotoURL || "",
          };
        });

        setPeople(merged);
      } catch (err) {
        console.error("Error loading station team:", err);
        setPeople([]);
      } finally {
        setLoading(false);
      }
    }

    loadTeam().catch(console.error);
  }, []);

  const sortedPeople = useMemo(() => {
    return [...people].sort((a, b) =>
      getVisibleName(a).localeCompare(getVisibleName(b))
    );
  }, [people]);

  const stationManagers = useMemo(() => {
    return sortedPeople.filter(
      (p) => normalizeLower(p.role) === "station_manager"
    );
  }, [sortedPeople]);

  const dutyManagers = useMemo(() => {
    return sortedPeople.filter(
      (p) => normalizeLower(p.role) === "duty_manager"
    );
  }, [sortedPeople]);

  const supervisorsGrouped = useMemo(() => {
    const rows = sortedPeople.filter(
      (p) => normalizeLower(p.role) === "supervisor"
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
      (p) => normalizeLower(p.role) === "agent"
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

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div style={{ position: "relative" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Directory
          </p>

          <h1
            style={{
              margin: "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Station Team
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            View the Eulen team structure at TPA by role and department.
          </p>
        </div>
      </div>

      {loading ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading team structure...
          </p>
        </PageCard>
      ) : (
        <>
          <GroupSection
            title="Station Manager"
            people={stationManagers}
            large
          />

          <GroupSection title="Duty Managers" people={dutyManagers} />

          <GroupedDepartmentSection
            title="Supervisors"
            groups={supervisorsGrouped}
          />

          <GroupedDepartmentSection
            title="Agents"
            groups={agentsGrouped}
          />
        </>
      )}
    </div>
  );
}
