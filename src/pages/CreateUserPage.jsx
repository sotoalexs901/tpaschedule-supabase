// src/pages/CreateUserPage.jsx
import React, { useState, useEffect } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 700,
        color: "#475569",
        letterSpacing: "0.03em",
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
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

export default function CreateUserPage() {
  const { user } = useUser();

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
              "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
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
            TPA OPS · User Administration
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

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("agent");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        list.sort((a, b) => {
          const na = (a.name || "").toLowerCase();
          const nb = (b.name || "").toLowerCase();
          if (na < nb) return -1;
          if (na > nb) return 1;
          return 0;
        });

        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees:", err);
        setMessage("Could not load employees list.");
      }
    }

    loadEmployees().catch(console.error);
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");

    const cleanUsername = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin || !role) {
      setMessage("All fields are required (username, PIN, role).");
      return;
    }

    if (cleanPin.length !== 4) {
      setMessage("PIN must be exactly 4 digits.");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        username: cleanUsername,
        pin: cleanPin,
        role,
        createdAt: serverTimestamp(),
      };

      if (employeeId) {
        payload.employeeId = employeeId;
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

      setUsername("");
      setPin("");
      setRole("agent");
      setEmployeeId("");

      setMessage("User created successfully!");
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
            TPA OPS · Administration
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
            Create New User
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Create login access for station agents, supervisors and managers,
            and optionally link each user to an employee profile.
          </p>
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

      <PageCard style={{ padding: 22, maxWidth: 760 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            User Information
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Fill out the account details and choose a role before saving.
          </p>
        </div>

        <form
          onSubmit={createUser}
          style={{
            display: "grid",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Username</FieldLabel>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div>
            <FieldLabel>PIN</FieldLabel>
            <TextInput
              type="password"
              value={pin}
              maxLength={4}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="4-digit PIN"
            />
          </div>

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
            <FieldLabel>
              Link to Employee (optional, recommended for Agents/Supervisors)
            </FieldLabel>
            <SelectInput
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— No employee profile linked —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name || "Unnamed"}
                  {emp.airline || emp.department
                    ? ` · ${emp.airline || ""} ${emp.department || ""}`
                    : ""}
                </option>
              ))}
            </SelectInput>

            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: "#64748b",
              }}
            >
              When linked, the employee record is updated with{" "}
              <code>loginUsername</code> and <code>linkedUserId</code>, so the
              user can see their personal schedule in <b>My Schedule</b>.
            </p>
          </div>

          <div style={{ marginTop: 6 }}>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? "Saving..." : "Create User"}
            </PrimaryButton>
          </div>
        </form>
      </PageCard>
    </div>
  );
}
