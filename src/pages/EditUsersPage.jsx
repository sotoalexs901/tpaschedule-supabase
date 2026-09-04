import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME } from "../config/appConfig.js";

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

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 16,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 16,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  fullWidth = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
    },
    soft: {
      background: "#edf7ff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    success: {
      background: "#ecfdf5",
      color: "#047857",
      border: "1px solid #a7f3d0",
      boxShadow: "none",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        width: fullWidth ? "100%" : "auto",
        ...styles[variant],
      }}
    >
      {children}
    </button>
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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeIdentity(value) {
  return normalizeLower(value);
}

function normalizeForUsername(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, "")
    .trim();
}

function getVisibleEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.displayName ||
    employee?.fullName ||
    employee?.employeeName ||
    employee?.username ||
    "Unnamed Employee"
  );
}

function getVisibleUserName(userRecord) {
  return (
    userRecord?.displayName ||
    userRecord?.fullName ||
    userRecord?.name ||
    userRecord?.username ||
    "User"
  );
}

function getInitials(name) {
  const clean = normalizeText(name);
  if (!clean) return "U";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getEmployeePhoto(employee) {
  return (
    employee?.profilePhotoURL ||
    employee?.photoURL ||
    employee?.photoUrl ||
    employee?.profilePhotoUrl ||
    ""
  );
}

function buildBaseUsername(fullName) {
  const clean = normalizeForUsername(fullName);
  if (!clean) return "";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";

  if (parts.length === 1) {
    return parts[0].replace(/[^a-z0-9]/g, "").slice(0, 20);
  }

  const first = parts[0].replace(/[^a-z0-9]/g, "");
  const last = parts[parts.length - 1].replace(/[^a-z0-9]/g, "");

  return `${first.slice(0, 1)}${last}`.slice(0, 20);
}

function makeUniqueUsername(base, existingUsernames, currentUserId = "") {
  if (!base) return "";

  const taken = new Set(
    existingUsernames
      .filter((item) => item.id !== currentUserId)
      .map((item) => normalizeLower(item.username))
      .filter(Boolean)
  );

  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) {
    suffix += 1;
  }

  return `${base}${suffix}`;
}

function getEmployeeMatch(userRecord, employees) {
  const employeeId = normalizeIdentity(userRecord?.employeeId);
  const username = normalizeIdentity(
    userRecord?.username || userRecord?.loginUsername
  );
  const displayName = normalizeIdentity(
    userRecord?.displayName || userRecord?.fullName || userRecord?.name
  );

  if (employeeId) {
    const byId = employees.find(
      (employee) => normalizeIdentity(employee.id) === employeeId
    );
    if (byId) return { employee: byId, matchType: "employeeId" };
  }

  if (username) {
    const byUsername = employees.find((employee) => {
      const candidate = normalizeIdentity(
        employee?.loginUsername || employee?.username
      );
      return candidate && candidate === username;
    });

    if (byUsername) return { employee: byUsername, matchType: "username" };
  }

  if (displayName) {
    const byName = employees.find(
      (employee) => normalizeIdentity(getVisibleEmployeeName(employee)) === displayName
    );
    if (byName) return { employee: byName, matchType: "name" };
  }

  return { employee: null, matchType: "" };
}

function ProfileIdentity({ employee, matchType }) {
  if (!employee) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontWeight: 850,
            flexShrink: 0,
          }}
        >
          ?
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 850, color: "#64748b" }}>
            Profile not linked
          </div>
          <div style={{ marginTop: 2, fontSize: 10.5, color: "#94a3b8" }}>
            Select an employee profile below.
          </div>
        </div>
      </div>
    );
  }

  const name = getVisibleEmployeeName(employee);
  const photo = getEmployeePhoto(employee);
  const position = employee?.position || "Employee";
  const department = employee?.department || "No Department";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          overflow: "hidden",
          background: "#e0f2fe",
          border: "1px solid #bae6fd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0f4c81",
          fontWeight: 850,
          flexShrink: 0,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          getInitials(name)
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 850,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 10.5,
            color: "#64748b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {position} {"\u00B7"} {department}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 9.5,
            color: "#16a34a",
            fontWeight: 800,
          }}
        >
          Linked{matchType ? ` by ${matchType}` : ""}
        </div>
      </div>
    </div>
  );
}

function MobileUserCard({
  userRecord,
  employees,
  allUsers,
  savingId,
  onChange,
  onSave,
  onReset,
  onDelete,
  onApplySuggestion,
}) {
  const match = getEmployeeMatch(userRecord, employees);
  const selectedEmployee =
    employees.find((employee) => employee.id === userRecord.employeeId) ||
    match.employee;
  const selectedName = selectedEmployee
    ? getVisibleEmployeeName(selectedEmployee)
    : getVisibleUserName(userRecord);
  const suggested = makeUniqueUsername(
    buildBaseUsername(selectedName),
    allUsers,
    userRecord.id
  );

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid #dbeafe",
        background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
        padding: 14,
        boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
      }}
    >
      <ProfileIdentity employee={selectedEmployee} matchType={match.matchType} />

      <div style={{ marginTop: 13, display: "grid", gap: 10 }}>
        <div>
          <div style={mobileLabelStyle}>Employee Profile</div>
          <SelectInput
            value={userRecord.employeeId || ""}
            onChange={(e) => onChange(userRecord.id, "employeeId", e.target.value)}
          >
            <option value="">Not linked</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {getVisibleEmployeeName(employee)}
              </option>
            ))}
          </SelectInput>
        </div>

        <div>
          <div style={mobileLabelStyle}>Username</div>
          <TextInput
            value={userRecord.username || ""}
            onChange={(e) => onChange(userRecord.id, "username", e.target.value)}
          />
          {!!suggested && normalizeLower(suggested) !== normalizeLower(userRecord.username) && (
            <div
              style={{
                marginTop: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 11,
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, color: "#64748b", fontWeight: 750 }}>
                  Suggested username
                </div>
                <div style={{ fontSize: 12, color: "#0369a1", fontWeight: 850 }}>
                  @{suggested}
                </div>
              </div>
              <ActionButton
                variant="soft"
                onClick={() => onApplySuggestion(userRecord.id, suggested)}
              >
                Use
              </ActionButton>
            </div>
          )}
        </div>

        <div>
          <div style={mobileLabelStyle}>PIN</div>
          <TextInput
            type="password"
            inputMode="numeric"
            value={userRecord.pin || ""}
            onChange={(e) =>
              onChange(userRecord.id, "pin", e.target.value.replace(/\D/g, ""))
            }
          />
        </div>

        <div>
          <div style={mobileLabelStyle}>Role</div>
          <SelectInput
            value={userRecord.role || "agent"}
            onChange={(e) => onChange(userRecord.id, "role", e.target.value)}
          >
            <option value="agent">Agent</option>
            <option value="supervisor">Supervisor</option>
            <option value="duty_manager">Duty Manager</option>
            <option value="station_manager">Station Manager</option>
          </SelectInput>
        </div>
      </div>

      <div
        style={{
          marginTop: 13,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <ActionButton
          fullWidth
          onClick={() => onSave(userRecord)}
          disabled={savingId === userRecord.id}
          variant="primary"
        >
          {savingId === userRecord.id ? "Saving..." : "Save"}
        </ActionButton>
        <ActionButton fullWidth onClick={() => onReset(userRecord.id)} variant="warning">
          Reset PIN
        </ActionButton>
        <div style={{ gridColumn: "1 / -1" }}>
          <ActionButton fullWidth onClick={() => onDelete(userRecord.id)} variant="danger">
            Delete User
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

export default function EditUsersPage() {
  const { user } = useUser();
  const isMobile = useIsMobile(900);

  // Hooks must be declared before any conditional return.
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setStatus("");

        const [usersSnap, employeesSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employees")),
        ]);

        const loadedUsers = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const loadedEmployees = employeesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((employee) => employee?.active !== false)
          .sort((a, b) =>
            getVisibleEmployeeName(a).localeCompare(getVisibleEmployeeName(b))
          );

        setUsers(loadedUsers);
        setEmployees(loadedEmployees);
      } catch (err) {
        console.error("Error loading user management data:", err);
        setStatus("Could not load users or employee profiles.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const enrichedUsers = useMemo(() => {
    return users.map((userRecord) => {
      const match = getEmployeeMatch(userRecord, employees);
      const selectedEmployee =
        employees.find((employee) => employee.id === userRecord.employeeId) ||
        match.employee;

      const candidateName = selectedEmployee
        ? getVisibleEmployeeName(selectedEmployee)
        : getVisibleUserName(userRecord);

      const suggestedUsername = makeUniqueUsername(
        buildBaseUsername(candidateName),
        users,
        userRecord.id
      );

      return {
        ...userRecord,
        __matchedEmployee: selectedEmployee || null,
        __matchType: match.matchType,
        __suggestedUsername: suggestedUsername,
      };
    });
  }, [users, employees]);

  const filteredUsers = useMemo(() => {
    const searchKey = normalizeLower(search);

    return enrichedUsers.filter((userRecord) => {
      const hasProfile = Boolean(userRecord.__matchedEmployee);

      if (profileFilter === "linked" && !hasProfile) return false;
      if (profileFilter === "unlinked" && hasProfile) return false;

      if (!searchKey) return true;

      const employee = userRecord.__matchedEmployee;
      const haystack = [
        userRecord.username,
        userRecord.role,
        getVisibleUserName(userRecord),
        employee ? getVisibleEmployeeName(employee) : "",
        employee?.department,
        employee?.position,
        employee?.airline,
      ]
        .map(normalizeLower)
        .join(" ");

      return haystack.includes(searchKey);
    });
  }, [enrichedUsers, search, profileFilter]);

  const linkedCount = useMemo(
    () => enrichedUsers.filter((item) => item.__matchedEmployee).length,
    [enrichedUsers]
  );

  const unlinkedCount = enrichedUsers.length - linkedCount;

  const updateUser = async (userRecord) => {
    try {
      setSavingId(userRecord.id);
      setStatus("");

      const selectedEmployee = employees.find(
        (employee) => employee.id === userRecord.employeeId
      );

      const payload = {
        username: normalizeText(userRecord.username),
        pin: normalizeText(userRecord.pin),
        role: userRecord.role || "agent",
        employeeId: normalizeText(userRecord.employeeId),
      };

      // When an employee is linked, keep identity fields in the user profile
      // aligned with the employee directory without overwriting employee data.
      if (selectedEmployee) {
        payload.displayName = getVisibleEmployeeName(selectedEmployee);
        payload.position =
          selectedEmployee.position || getDefaultPosition(payload.role);
        payload.department = selectedEmployee.department || "";
        payload.airline = selectedEmployee.airline || "";

        if (getEmployeePhoto(selectedEmployee)) {
          payload.profilePhotoURL = getEmployeePhoto(selectedEmployee);
        }
      }

      await updateDoc(doc(db, "users", userRecord.id), payload);

      setUsers((prev) =>
        prev.map((item) =>
          item.id === userRecord.id ? { ...item, ...payload } : item
        )
      );

      setStatus(
        selectedEmployee
          ? `User \"${payload.username}\" saved and linked to ${getVisibleEmployeeName(selectedEmployee)}.`
          : `User \"${payload.username}\" updated successfully.`
      );
    } catch (err) {
      console.error("Error updating user:", err);
      setStatus("Could not update user.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (id) => {
    const target = users.find((item) => item.id === id);
    if (!window.confirm(`Delete user \"${target?.username || ""}\"?`)) return;

    try {
      await deleteDoc(doc(db, "users", id));
      setUsers((prev) => prev.filter((item) => item.id !== id));
      setStatus("User deleted.");
    } catch (err) {
      console.error("Error deleting user:", err);
      setStatus("Could not delete user.");
    }
  };

  const resetPin = async (id) => {
    const target = users.find((item) => item.id === id);
    if (!window.confirm(`Reset PIN for \"${target?.username || ""}\" to 0000?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, "users", id), { pin: "0000" });

      setUsers((prev) =>
        prev.map((item) => (item.id === id ? { ...item, pin: "0000" } : item))
      );

      setStatus("PIN reset to 0000.");
    } catch (err) {
      console.error("Error resetting PIN:", err);
      setStatus("Could not reset PIN.");
    }
  };

  const handleChange = (id, field, value) => {
    setUsers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const applySuggestion = (id, suggestion) => {
    handleChange(id, "username", suggestion);
    setStatus(`Suggested username \"${suggestion}\" applied. Press Save to confirm.`);
  };

  if (!user || user.role !== "station_manager") {
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
              "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #2e9fd6 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            {APP_NAME} {"\u00B7"} User Management
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
            Access denied
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Only Station Managers can access the user administration panel.
          </p>
        </div>

        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
              color: "#9f1239",
              fontWeight: 700,
            }}
          >
            You do not have permission to edit users.
          </div>
        </PageCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: "grid",
          gap: 18,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
        }}
      >
        <PageCard style={{ padding: 24 }}>
          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Loading users and employee profiles...
          </p>
        </PageCard>
      </div>
    );
  }

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
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 240,
            height: 240,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            top: -110,
            right: -45,
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
          <div style={{ display: "flex", gap: 13, alignItems: "center", minWidth: 0 }}>
            <div
              style={{
                width: isMobile ? 50 : 58,
                height: isMobile ? 50 : 58,
                borderRadius: 17,
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.86)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.74)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Administration
              </p>

              <h1
                style={{
                  margin: "6px 0 4px",
                  fontSize: isMobile ? 25 : 34,
                  lineHeight: 1.05,
                  fontWeight: 850,
                  letterSpacing: "-0.04em",
                }}
              >
                Manage Users
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
                Identify the employee behind each account, link the correct profile,
                and manage usernames, roles and PINs.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(74px, 1fr))",
              gap: 8,
              width: isMobile ? "100%" : 300,
            }}
          >
            {[
              ["Users", users.length],
              ["Linked", linkedCount],
              ["Unlinked", unlinkedCount],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  borderRadius: 14,
                  padding: "10px 11px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.72)", fontWeight: 750 }}>
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

      {status && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#1769aa",
              fontSize: 13,
              fontWeight: 750,
            }}
          >
            {status}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 14 : 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 1fr) 210px",
            gap: 10,
          }}
        >
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, employee, department or role..."
          />

          <SelectInput
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
          >
            <option value="all">All Accounts</option>
            <option value="linked">Linked Profiles</option>
            <option value="unlinked">Unlinked Profiles</option>
          </SelectInput>
        </div>

        {unlinkedCount > 0 && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              padding: "11px 13px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: 11.5,
              lineHeight: 1.55,
            }}
          >
            {unlinkedCount} account{unlinkedCount !== 1 ? "s are" : " is"} not linked
            to an employee profile. Linking the profile makes the employee name,
            photo, department and suggested username visible here.
          </div>
        )}
      </PageCard>

      {isMobile ? (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredUsers.map((userRecord) => (
            <MobileUserCard
              key={userRecord.id}
              userRecord={userRecord}
              employees={employees}
              allUsers={users}
              savingId={savingId}
              onChange={handleChange}
              onSave={updateUser}
              onReset={resetPin}
              onDelete={deleteUser}
              onApplySuggestion={applySuggestion}
            />
          ))}

          {filteredUsers.length === 0 && (
            <PageCard style={{ padding: 20 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                No users match the current filters.
              </p>
            </PageCard>
          )}
        </div>
      ) : (
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 850,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              User Directory
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#64748b" }}>
              Link each platform user to the employee profile created in Employees.
            </p>
          </div>

          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1280,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle({ minWidth: 240 })}>Employee Profile</th>
                  <th style={thStyle({ minWidth: 230 })}>Link Profile</th>
                  <th style={thStyle({ minWidth: 210 })}>Username</th>
                  <th style={thStyle({ minWidth: 150 })}>PIN</th>
                  <th style={thStyle({ minWidth: 170 })}>Role</th>
                  <th style={thStyle({ textAlign: "center" })}>Save</th>
                  <th style={thStyle({ textAlign: "center" })}>Reset PIN</th>
                  <th style={thStyle({ textAlign: "center" })}>Delete</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((userRecord, index) => {
                  const employee = userRecord.__matchedEmployee;
                  const suggestion = userRecord.__suggestedUsername;

                  return (
                    <tr
                      key={userRecord.id}
                      style={{ background: index % 2 === 0 ? "#ffffff" : "#fbfdff" }}
                    >
                      <td style={tdStyle}>
                        <ProfileIdentity
                          employee={employee}
                          matchType={userRecord.__matchType}
                        />
                      </td>

                      <td style={tdStyle}>
                        <SelectInput
                          value={userRecord.employeeId || ""}
                          onChange={(e) =>
                            handleChange(userRecord.id, "employeeId", e.target.value)
                          }
                          style={{ fontSize: 13 }}
                        >
                          <option value="">Not linked</option>
                          {employees.map((employeeOption) => (
                            <option key={employeeOption.id} value={employeeOption.id}>
                              {getVisibleEmployeeName(employeeOption)}
                            </option>
                          ))}
                        </SelectInput>
                      </td>

                      <td style={tdStyle}>
                        <TextInput
                          value={userRecord.username || ""}
                          onChange={(e) =>
                            handleChange(userRecord.id, "username", e.target.value)
                          }
                          style={{ fontSize: 13 }}
                        />

                        {!!suggestion &&
                          normalizeLower(suggestion) !== normalizeLower(userRecord.username) && (
                            <div
                              style={{
                                marginTop: 7,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 750 }}>
                                  Suggested
                                </div>
                                <div style={{ fontSize: 11.5, color: "#0369a1", fontWeight: 850 }}>
                                  @{suggestion}
                                </div>
                              </div>
                              <ActionButton
                                variant="soft"
                                onClick={() => applySuggestion(userRecord.id, suggestion)}
                              >
                                Use
                              </ActionButton>
                            </div>
                          )}
                      </td>

                      <td style={tdStyle}>
                        <TextInput
                          type="password"
                          inputMode="numeric"
                          value={userRecord.pin || ""}
                          onChange={(e) =>
                            handleChange(
                              userRecord.id,
                              "pin",
                              e.target.value.replace(/\D/g, "")
                            )
                          }
                          style={{ fontSize: 13 }}
                        />
                      </td>

                      <td style={tdStyle}>
                        <SelectInput
                          value={userRecord.role || "agent"}
                          onChange={(e) =>
                            handleChange(userRecord.id, "role", e.target.value)
                          }
                          style={{ fontSize: 13 }}
                        >
                          <option value="agent">Agent</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="duty_manager">Duty Manager</option>
                          <option value="station_manager">Station Manager</option>
                        </SelectInput>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionButton
                          onClick={() => updateUser(userRecord)}
                          disabled={savingId === userRecord.id}
                          variant="primary"
                        >
                          {savingId === userRecord.id ? "Saving..." : "Save"}
                        </ActionButton>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionButton
                          onClick={() => resetPin(userRecord.id)}
                          variant="warning"
                        >
                          Reset
                        </ActionButton>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionButton
                          onClick={() => deleteUser(userRecord.id)}
                          variant="danger"
                        >
                          Delete
                        </ActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <p style={{ margin: "16px 0 0", color: "#64748b", fontSize: 13 }}>
              No users match the current filters.
            </p>
          )}
        </PageCard>
      )}
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px",
    fontSize: 11,
    fontWeight: 850,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "12px 14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};

const mobileLabelStyle = {
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 850,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

// END EditUsersPage
