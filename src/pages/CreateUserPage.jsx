// src/pages/CreateUserPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
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

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
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
        borderRadius: 14,
        padding: "12px 14px",
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
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 16,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function PrimaryButton({ children, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        width: "100%",
        border: "none",
        background: disabled
          ? "#94a3b8"
          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
        color: "#fff",
        borderRadius: 14,
        padding: "13px 16px",
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 12px 24px rgba(23,105,170,0.18)",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1px solid #bfdbfe",
        background: disabled ? "#f8fafc" : "#eff6ff",
        color: disabled ? "#94a3b8" : "#1769aa",
        borderRadius: 12,
        padding: "9px 12px",
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getEmployeeSuggestedPosition(emp, selectedRole) {
  return (
    emp?.position ||
    emp?.jobTitle ||
    emp?.roleLabel ||
    getDefaultPosition(selectedRole)
  );
}

function getEmployeeName(emp) {
  return (
    emp?.name ||
    emp?.displayName ||
    emp?.fullName ||
    emp?.employeeName ||
    "Unnamed"
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function slugPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function suggestBaseUsername(name) {
  const clean = String(name || "").trim();
  if (!clean) return "";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";

  // Employee names are stored as:
  // LAST NAME + FIRST NAME
  //
  // Example:
  // "Napoles Alexis" -> "anapoles"
  // "Diaz Evelin"    -> "ediaz"
  //
  // The username format is:
  // first-name initial + last name.
  const lastName = slugPart(parts[0]);
  const firstName = slugPart(parts[1] || "");

  if (!lastName && !firstName) return "";
  if (!firstName) return lastName;

  return `${firstName.slice(0, 1)}${lastName}`;
}

function getUniqueSuggestion(name, existingUsernames) {
  const base = suggestBaseUsername(name);
  if (!base) return "";

  const used = new Set(
    Array.from(existingUsernames || []).map((value) => normalizeLower(value))
  );

  if (!used.has(base)) return base;

  let counter = 2;
  while (used.has(`${base}${counter}`)) {
    counter += 1;
  }

  return `${base}${counter}`;
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

export default function CreateUserPage() {
  const { user } = useUser();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("2026");
  const [role, setRole] = useState("agent");
  const [employeeId, setEmployeeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("Agent");

  const [employees, setEmployees] = useState([]);
  const [existingUsers, setExistingUsers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedEmployee = useMemo(
    () => employees.find((emp) => emp.id === employeeId) || null,
    [employees, employeeId]
  );

  const existingUsernames = useMemo(() => {
    const values = new Set();

    existingUsers.forEach((u) => {
      const usernameValue = normalizeLower(u.username || u.loginUsername);
      if (usernameValue) values.add(usernameValue);
    });

    return values;
  }, [existingUsers]);

  const suggestedUsername = useMemo(() => {
    const name = selectedEmployee
      ? getEmployeeName(selectedEmployee)
      : displayName;

    return getUniqueSuggestion(name, existingUsernames);
  }, [selectedEmployee, displayName, existingUsernames]);

  const duplicateUsername = useMemo(() => {
    const clean = normalizeLower(username);
    if (!clean) return null;

    return (
      existingUsers.find(
        (u) =>
          normalizeLower(u.username || u.loginUsername) === clean
      ) || null
    );
  }, [existingUsers, username]);

  const duplicateEmployeeAccount = useMemo(() => {
    if (!employeeId) return null;

    return (
      existingUsers.find(
        (u) =>
          normalizeText(u.employeeId) === employeeId ||
          normalizeText(u.linkedEmployeeId) === employeeId
      ) || null
    );
  }, [existingUsers, employeeId]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingData(true);

        const [employeesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "users")),
        ]);

        const employeeList = employeesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        employeeList.sort((a, b) =>
          getEmployeeName(a).localeCompare(getEmployeeName(b))
        );

        const userList = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setEmployees(employeeList);
        setExistingUsers(userList);
      } catch (err) {
        console.error("Error loading create-user data:", err);
        setMessage("Could not load employees or existing users.");
      } finally {
        setLoadingData(false);
      }
    }

    loadData().catch(console.error);
  }, []);

  useEffect(() => {
    if (!employeeId || !selectedEmployee) return;

    const name = getEmployeeName(selectedEmployee);

    setDisplayName(name);
    setPosition(getEmployeeSuggestedPosition(selectedEmployee, role));

    const suggestion = getUniqueSuggestion(name, existingUsernames);
    if (suggestion) {
      setUsername(suggestion);
    }
  }, [employeeId, selectedEmployee, role, existingUsernames]);

  useEffect(() => {
    if (!employeeId) {
      setPosition(getDefaultPosition(role));
    }
  }, [role, employeeId]);

  const canCreate = useMemo(() => {
    if (!user || user.role !== "station_manager") return false;
    if (loadingData || loading) return false;
    if (!normalizeText(username)) return false;
    if (!normalizeText(displayName)) return false;
    if (!normalizeText(position)) return false;
    if (!/^\d{4}$/.test(pin)) return false;
    if (duplicateUsername) return false;
    if (duplicateEmployeeAccount) return false;
    return true;
  }, [
    user,
    loadingData,
    loading,
    username,
    displayName,
    position,
    pin,
    duplicateUsername,
    duplicateEmployeeAccount,
  ]);

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
              "linear-gradient(135deg, #061f3d 0%, #0f4c81 50%, #4fb6e9 100%)",
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
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            {APP_NAME} {"\u00B7"} User Administration
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
            Only Station Managers can create new users.
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
            You do not have permission to create user accounts.
          </div>
        </PageCard>
      </div>
    );
  }

  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");

    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();
    const cleanDisplayName = displayName.trim();
    const cleanPosition = position.trim();

    if (!cleanUsername || !cleanPin || !role) {
      setMessage("Username, PIN and role are required.");
      return;
    }

    if (!cleanDisplayName) {
      setMessage("Display name is required.");
      return;
    }

    if (!cleanPosition) {
      setMessage("Position is required.");
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setMessage("PIN must be exactly 4 digits.");
      return;
    }

    if (duplicateUsername) {
      setMessage(
        `Username "${cleanUsername}" already exists. Please use a different username.`
      );
      return;
    }

    if (duplicateEmployeeAccount) {
      setMessage(
        `This employee already appears to have a user account: ${
          duplicateEmployeeAccount.username ||
          duplicateEmployeeAccount.loginUsername ||
          "existing user"
        }.`
      );
      return;
    }

    try {
      setLoading(true);

      // Re-check immediately before creation in case another account
      // was created after the page first loaded.
      const freshUsersSnap = await getDocs(collection(db, "users"));
      const freshUsers = freshUsersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const sameUsername = freshUsers.find(
        (u) =>
          normalizeLower(u.username || u.loginUsername) === cleanUsername
      );

      if (sameUsername) {
        setExistingUsers(freshUsers);
        setMessage(
          `Username "${cleanUsername}" already exists. Please use a different username.`
        );
        setLoading(false);
        return;
      }

      if (employeeId) {
        const sameEmployee = freshUsers.find(
          (u) =>
            normalizeText(u.employeeId) === employeeId ||
            normalizeText(u.linkedEmployeeId) === employeeId
        );

        if (sameEmployee) {
          setExistingUsers(freshUsers);
          setMessage(
            `This employee already has an account linked to username "${
              sameEmployee.username ||
              sameEmployee.loginUsername ||
              "existing user"
            }".`
          );
          setLoading(false);
          return;
        }
      }

      const payload = {
        username: cleanUsername,
        loginUsername: cleanUsername,
        pin: cleanPin,
        role,
        displayName: cleanDisplayName,
        position: cleanPosition,
        createdAt: serverTimestamp(),
      };

      if (selectedEmployee) {
        payload.employeeId = employeeId;
        payload.department =
          selectedEmployee.department || "";
        payload.airline =
          selectedEmployee.airline || "";
        payload.profilePhotoURL =
          getPersonPhoto(selectedEmployee);
      }

      const userRef = await addDoc(collection(db, "users"), payload);

      if (employeeId) {
        try {
          const empRef = doc(db, "employees", employeeId);
          await updateDoc(empRef, {
            loginUsername: cleanUsername,
            linkedUserId: userRef.id,
          });
        } catch (linkErr) {
          console.error("Error updating linked employee:", linkErr);
        }
      }

      const newUser = {
        id: userRef.id,
        ...payload,
      };

      setExistingUsers((prev) => [...prev, newUser]);

      setUsername("");
      setPin("2026");
      setRole("agent");
      setEmployeeId("");
      setDisplayName("");
      setPosition("Agent");

      setMessage(
        `User "${cleanUsername}" created successfully with default PIN 2026.`
      );
    } catch (error) {
      console.error("Error creating user:", error);
      setMessage("Error creating user.");
    } finally {
      setLoading(false);
    }
  };

  const success = message.toLowerCase().includes("success");

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
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
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

        <div
          style={{
            position: "relative",
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              overflow: "hidden",
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.86)",
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
            <p
              style={{
                margin: 0,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.76)",
                fontWeight: 800,
              }}
            >
              {APP_NAME} {"\u00B7"} Administration
            </p>

            <h1
              style={{
                margin: "6px 0 4px",
                fontSize: 30,
                lineHeight: 1.05,
                fontWeight: 850,
                letterSpacing: "-0.04em",
              }}
            >
              Create New User
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 13,
                color: "rgba(255,255,255,0.86)",
              }}
            >
              Select the employee first, review the profile, and create the
              station login with a unique recommended username.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: success ? "#ecfdf5" : "#fff1f2",
              border: `1px solid ${success ? "#a7f3d0" : "#fecdd3"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: success ? "#065f46" : "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22, maxWidth: 900 }}>
        <div style={{ marginBottom: 18 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            1. Select Employee Profile
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Selecting an employee lets the system identify the correct profile,
            detect possible duplicates, and suggest a username.
          </p>
        </div>

        <form
          onSubmit={createUser}
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          <div>
            <FieldLabel>Employee Profile</FieldLabel>
            <SelectInput
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setMessage("");
              }}
              disabled={loadingData}
            >
              <option value="">
                {loadingData
                  ? "Loading employees..."
                  : "\u2014 Select employee profile \u2014"}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {getEmployeeName(emp)}
                  {emp.airline || emp.department
                    ? ` \u00B7 ${emp.airline || ""}${
                        emp.airline && emp.department ? " / " : ""
                      }${emp.department || ""}`
                    : ""}
                </option>
              ))}
            </SelectInput>
          </div>

          {selectedEmployee && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr)",
                gap: 14,
                alignItems: "center",
                background:
                  "linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)",
                border: "1px solid #dbeafe",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f4c81",
                  fontWeight: 850,
                  fontSize: 22,
                }}
              >
                {getPersonPhoto(selectedEmployee) ? (
                  <img
                    src={getPersonPhoto(selectedEmployee)}
                    alt={getEmployeeName(selectedEmployee)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  getEmployeeName(selectedEmployee)
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 850,
                    color: "#0f172a",
                    lineHeight: 1.2,
                  }}
                >
                  {getEmployeeName(selectedEmployee)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    fontWeight: 750,
                    color: "#1769aa",
                  }}
                >
                  {getEmployeeSuggestedPosition(selectedEmployee, role)}
                </div>

                {(selectedEmployee.airline ||
                  selectedEmployee.department) && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {selectedEmployee.airline || "No Airline"}
                    {" \u00B7 "}
                    {selectedEmployee.department || "No Department"}
                  </div>
                )}

                {selectedEmployee.loginUsername && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "#b45309",
                      fontWeight: 800,
                    }}
                  >
                    Employee record already shows login:{" "}
                    {selectedEmployee.loginUsername}
                  </div>
                )}
              </div>
            </div>
          )}

          {duplicateEmployeeAccount && (
            <div
              style={{
                borderRadius: 16,
                padding: "13px 15px",
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                fontSize: 13,
                fontWeight: 750,
                lineHeight: 1.55,
              }}
            >
              {"\u26A0"} Duplicate account warning: this employee is already
              linked to username{" "}
              <b>
                {duplicateEmployeeAccount.username ||
                  duplicateEmployeeAccount.loginUsername ||
                  "existing user"}
              </b>
              . A second account will not be created.
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid #eef2f7",
              paddingTop: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              2. Account Information
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Username</FieldLabel>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <TextInput
                  value={username}
                  onChange={(e) => {
                    setUsername(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "")
                    );
                    setMessage("");
                  }}
                  placeholder="jdoe"
                  autoCapitalize="none"
                  autoCorrect="off"
                />

                <SecondaryButton
                  onClick={() => setUsername(suggestedUsername)}
                  disabled={!suggestedUsername}
                >
                  Use suggestion
                </SecondaryButton>
              </div>

              {suggestedUsername && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "9px 11px",
                    borderRadius: 12,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1769aa",
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  Suggested username: <b>{suggestedUsername}</b>
                  <div
                    style={{
                      marginTop: 3,
                      color: "#64748b",
                      fontSize: 10.5,
                      fontWeight: 650,
                    }}
                  >
                    Format: first-name initial + last name (employee records are stored Last Name / First Name).
                  </div>
                </div>
              )}

              {duplicateUsername && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 11px",
                    borderRadius: 12,
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    color: "#9f1239",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {"\u26A0"} Username already exists. Please use another username.
                </div>
              )}
            </div>

            <div>
              <FieldLabel>PIN</FieldLabel>
              <TextInput
                type="password"
                value={pin}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="2026"
              />
              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 11,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Default PIN: <b>2026</b>
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Select Role</FieldLabel>
              <SelectInput
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
                <option value="duty_manager">Duty Manager</option>
                <option value="station_manager">Station Manager</option>
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Position</FieldLabel>
              <TextInput
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Agent / Supervisor / Duty Manager / Station Manager"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Display Name</FieldLabel>
            <TextInput
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alexis Napoles"
            />
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "12px 14px",
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            Birthday information is not required during account creation. The
            employee can optionally add month and day later from My Profile.
          </div>

          <div style={{ marginTop: 6 }}>
            <PrimaryButton type="submit" disabled={!canCreate}>
              {loading ? "Saving..." : "Create User"}
            </PrimaryButton>
          </div>

          {!canCreate && !loadingData && (
            <p
              style={{
                margin: 0,
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              Resolve duplicate warnings and complete all required fields before
              creating the account.
            </p>
          )}
        </form>
      </PageCard>

      <div
        style={{
          textAlign: "center",
          padding: "0 10px 8px",
          fontSize: 10.5,
          color: "#94a3b8",
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END CreateUserPage
