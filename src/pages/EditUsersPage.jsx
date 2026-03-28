import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
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

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
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
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
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
}) {
  const styles = {
    primary: {
      background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
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
  };

  return (
    <button
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
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export default function EditUsersPage() {
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
            TPA OPS · User Management
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

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, "users"));
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading users:", err);
        setStatus("Could not load users.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const updateUser = async (u) => {
    try {
      setSavingId(u.id);
      await updateDoc(doc(db, "users", u.id), {
        username: u.username,
        pin: u.pin,
        role: u.role,
      });
      setStatus(`User "${u.username}" updated successfully.`);
    } catch (err) {
      console.error("Error updating user:", err);
      setStatus("Could not update user.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (id) => {
    const target = users.find((u) => u.id === id);
    if (!window.confirm(`Delete user "${target?.username || ""}"?`)) return;

    try {
      await deleteDoc(doc(db, "users", id));
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setStatus("User deleted.");
    } catch (err) {
      console.error("Error deleting user:", err);
      setStatus("Could not delete user.");
    }
  };

  const resetPin = async (id) => {
    const target = users.find((u) => u.id === id);
    if (!window.confirm(`Reset PIN for "${target?.username || ""}" to 0000?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, "users", id), { pin: "0000" });

      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, pin: "0000" } : u))
      );

      setStatus("PIN reset to 0000.");
    } catch (err) {
      console.error("Error resetting PIN:", err);
      setStatus("Could not reset PIN.");
    }
  };

  const handleChange = (id, field, value) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u))
    );
  };

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
            Loading users...
          </p>
        </PageCard>
      </div>
    );
  }

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
            Manage Users
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Update usernames, roles and PINs, or remove inactive users from the
            system.
          </p>
        </div>
      </div>

      {status && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {status}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 18, overflow: "hidden" }}>
        <div
          style={{
            marginBottom: 14,
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
            User Directory
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Review and update all active user accounts.
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
              minWidth: 900,
              background: "#fff",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f8fbff",
                }}
              >
                <th
                  style={thStyle({
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  Username
                </th>
                <th
                  style={thStyle({
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  PIN
                </th>
                <th
                  style={thStyle({
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  Role
                </th>
                <th
                  style={thStyle({
                    textAlign: "center",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  Save
                </th>
                <th
                  style={thStyle({
                    textAlign: "center",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  Reset PIN
                </th>
                <th
                  style={thStyle({
                    textAlign: "center",
                    borderBottom: "1px solid #e2e8f0",
                  })}
                >
                  Delete
                </th>
              </tr>
            </thead>

            <tbody>
              {users.map((u, index) => (
                <tr
                  key={u.id}
                  style={{
                    background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>
                    <TextInput
                      value={u.username}
                      onChange={(e) =>
                        handleChange(u.id, "username", e.target.value)
                      }
                    />
                  </td>

                  <td style={tdStyle}>
                    <TextInput
                      type="password"
                      value={u.pin}
                      onChange={(e) => handleChange(u.id, "pin", e.target.value)}
                    />
                  </td>

                  <td style={tdStyle}>
                    <SelectInput
                      value={u.role}
                      onChange={(e) =>
                        handleChange(u.id, "role", e.target.value)
                      }
                    >
                      <option value="agent">Agent</option>
                      <option value="duty_manager">Duty Manager</option>
                      <option value="station_manager">Station Manager</option>
                    </SelectInput>
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ActionButton
                      onClick={() => updateUser(u)}
                      disabled={savingId === u.id}
                      variant="primary"
                    >
                      {savingId === u.id ? "Saving..." : "Save"}
                    </ActionButton>
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ActionButton
                      onClick={() => resetPin(u.id)}
                      variant="warning"
                    >
                      Reset
                    </ActionButton>
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ActionButton
                      onClick={() => deleteUser(u.id)}
                      variant="danger"
                    >
                      Delete
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};
