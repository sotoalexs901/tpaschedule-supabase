import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// IMPORTANT:
// Employee names in this collection are stored as:
// LAST NAME + FIRST NAME
//
// Username suggestion format:
// first-name initial + last name
//
// Example:
// "Napoles Alexis" -> "anapoles"
// "Diaz Evelin"    -> "ediaz"

async function syncUserLink(employeeId, loginUsername) {
  const cleanUsername = String(loginUsername || "").trim().toLowerCase();
  if (!cleanUsername) return;

  try {
    const usernameQuery = query(
      collection(db, "users"),
      where("username", "==", cleanUsername)
    );

    const loginUsernameQuery = query(
      collection(db, "users"),
      where("loginUsername", "==", cleanUsername)
    );

    const [usernameSnap, loginUsernameSnap] = await Promise.all([
      getDocs(usernameQuery),
      getDocs(loginUsernameQuery),
    ]);

    const refs = new Map();

    usernameSnap.docs.forEach((u) => refs.set(u.id, u.ref));
    loginUsernameSnap.docs.forEach((u) => refs.set(u.id, u.ref));

    if (!refs.size) return;

    await Promise.all(
      Array.from(refs.values()).map((ref) =>
        updateDoc(ref, {
          employeeId,
        })
      )
    );
  } catch (err) {
    console.error("Error syncing user link:", err);
  }
}

function getEmployeeDisplayName(emp) {
  return (
    emp?.name ||
    emp?.fullName ||
    emp?.displayName ||
    emp?.employeeName ||
    ""
  ).trim();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDisplay(value) {
  return String(value || "").trim();
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

  // Stored order: LAST NAME + FIRST NAME
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
    Array.from(existingUsernames || []).map((value) => normalizeText(value))
  );

  if (!used.has(base)) return base;

  let counter = 2;
  while (used.has(`${base}${counter}`)) {
    counter += 1;
  }

  return `${base}${counter}`;
}

function getLastNameInitial(emp) {
  const fullName = getEmployeeDisplayName(emp);
  if (!fullName) return "#";

  const parts = fullName.split(/\s+/).filter(Boolean);
  const lastName = parts[0] || "";
  const initial = lastName.charAt(0).toUpperCase();

  return /[A-Z]/.test(initial) ? initial : "#";
}

function getDepartmentLabel(value) {
  const clean = String(value || "").trim();
  return clean || "No Department";
}

function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
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

function TextArea(props) {
  return (
    <textarea
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
        resize: "vertical",
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

function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
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
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export default function EmployeesPage() {
  const isMobile = useIsMobile(760);

  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");
  const [showInStationTeam, setShowInStationTeam] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [formMessage, setFormMessage] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [importStatus, setImportStatus] = useState("");

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const loadData = async () => {
    const [employeesSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "users")),
    ]);

    setEmployees(
      employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );

    setUsers(
      usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  const allUsernames = useMemo(() => {
    const values = new Set();

    employees.forEach((emp) => {
      const value = normalizeText(emp.loginUsername);
      if (value) values.add(value);
    });

    users.forEach((u) => {
      const value = normalizeText(u.username || u.loginUsername);
      if (value) values.add(value);
    });

    if (editingId) {
      const editingEmployee = employees.find((emp) => emp.id === editingId);
      const editingUsername = normalizeText(editingEmployee?.loginUsername);
      if (editingUsername) values.delete(editingUsername);
    }

    return values;
  }, [employees, users, editingId]);

  const suggestedUsername = useMemo(
    () => getUniqueSuggestion(name, allUsernames),
    [name, allUsernames]
  );

  const duplicateUsername = useMemo(() => {
    const cleanUsername = normalizeText(username);
    if (!cleanUsername) return null;

    const duplicateEmployee = employees.find(
      (emp) =>
        emp.id !== editingId &&
        normalizeText(emp.loginUsername) === cleanUsername
    );

    if (duplicateEmployee) {
      return {
        source: "employee",
        label: getEmployeeDisplayName(duplicateEmployee) || "another employee",
      };
    }

    const duplicateUser = users.find(
      (u) =>
        normalizeText(u.username || u.loginUsername) === cleanUsername &&
        normalizeText(u.employeeId) !== normalizeText(editingId)
    );

    if (duplicateUser) {
      return {
        source: "user",
        label:
          duplicateUser.displayName ||
          duplicateUser.username ||
          duplicateUser.loginUsername ||
          "existing user account",
      };
    }

    return null;
  }, [username, employees, users, editingId]);

  const duplicateName = useMemo(() => {
    const cleanName = normalizeText(name);
    if (!cleanName) return null;

    return (
      employees.find(
        (emp) =>
          emp.id !== editingId &&
          normalizeText(getEmployeeDisplayName(emp)) === cleanName
      ) || null
    );
  }, [name, employees, editingId]);

  const departments = useMemo(() => {
    const values = new Set();

    employees.forEach((emp) => {
      const dept = normalizeDisplay(emp.department);
      if (dept) values.add(dept);
    });

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [employees]);

  const groupedEmployees = useMemo(() => {
    const searchKey = normalizeText(search);

    const filtered = employees.filter((emp) => {
      const dept = getDepartmentLabel(emp.department);

      if (
        departmentFilter !== "ALL" &&
        dept !== departmentFilter
      ) {
        return false;
      }

      if (!searchKey) return true;

      const haystack = [
        getEmployeeDisplayName(emp),
        emp.loginUsername,
        emp.department,
        emp.position,
        emp.status,
        emp.notes,
      ]
        .map(normalizeText)
        .join(" ");

      return haystack.includes(searchKey);
    });

    const sorted = [...filtered].sort((a, b) => {
      const aDepartment = normalizeText(a.department);
      const bDepartment = normalizeText(b.department);

      if (aDepartment !== bDepartment) {
        return aDepartment.localeCompare(bDepartment);
      }

      const aInitial = getLastNameInitial(a);
      const bInitial = getLastNameInitial(b);

      if (aInitial !== bInitial) {
        if (aInitial === "#") return 1;
        if (bInitial === "#") return -1;
        return aInitial.localeCompare(bInitial);
      }

      return getEmployeeDisplayName(a).localeCompare(
        getEmployeeDisplayName(b)
      );
    });

    const groups = {};

    sorted.forEach((emp) => {
      const dept = getDepartmentLabel(emp.department);
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(emp);
    });

    return Object.entries(groups).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
    );
  }, [employees, search, departmentFilter]);

  const handleAddOrUpdateEmployee = async (e) => {
    e.preventDefault();
    setFormMessage("");

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanName) {
      setFormMessage("Name is required.");
      return;
    }

    if (duplicateName) {
      setFormMessage(
        `An employee with the same name already exists: "${getEmployeeDisplayName(
          duplicateName
        )}". Please verify before saving.`
      );
      return;
    }

    if (duplicateUsername) {
      setFormMessage(
        `Username "${cleanUsername}" is already being used by ${duplicateUsername.label}.`
      );
      return;
    }

    try {
      if (editingId) {
        const ref = doc(db, "employees", editingId);

        await updateDoc(ref, {
          name: cleanName,
          loginUsername: cleanUsername || null,
          department: department.trim() || null,
          position: position.trim() || null,
          status,
          active: status.toLowerCase() === "active",
          notes: notes.trim() || null,
          showInStationTeam,
        });

        await syncUserLink(editingId, cleanUsername);
        setFormMessage("Employee updated successfully.");
      } else {
        const ref = await addDoc(collection(db, "employees"), {
          name: cleanName,
          loginUsername: cleanUsername || null,
          department: department.trim() || null,
          position: position.trim() || null,
          status,
          active: status.toLowerCase() === "active",
          notes: notes.trim() || null,
          showInStationTeam,
          createdAt: new Date().toISOString(),
        });

        await syncUserLink(ref.id, cleanUsername);
        setFormMessage("Employee created successfully.");
      }

      setName("");
      setUsername("");
      setDepartment("");
      setPosition("");
      setStatus("Active");
      setNotes("");
      setShowInStationTeam(true);
      setEditingId(null);

      await loadData();
    } catch (err) {
      console.error(err);
      setFormMessage("Error saving employee. Check console for details.");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setUsername("");
    setDepartment("");
    setPosition("");
    setStatus("Active");
    setNotes("");
    setShowInStationTeam(true);
    setFormMessage("");
  };

  const handleDelete = async (id) => {
    const target = employees.find((emp) => emp.id === id);

    if (
      !window.confirm(
        `Delete employee "${getEmployeeDisplayName(target) || ""}"?`
      )
    ) {
      return;
    }

    await deleteDoc(doc(db, "employees", id));
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  const handleStartEdit = (emp) => {
    setEditingId(emp.id);
    setName(emp.name || "");
    setUsername(emp.loginUsername || "");
    setDepartment(emp.department || "");
    setPosition(emp.position || "");
    setStatus(emp.status || (emp.active ? "Active" : "Inactive"));
    setNotes(emp.notes || "");
    setShowInStationTeam(emp.showInStationTeam !== false);
    setFormMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggleStationTeam = async (emp) => {
    try {
      await updateDoc(doc(db, "employees", emp.id), {
        showInStationTeam: emp.showInStationTeam === false,
      });

      setEmployees((prev) =>
        prev.map((item) =>
          item.id === emp.id
            ? {
                ...item,
                showInStationTeam: item.showInStationTeam === false,
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      setFormMessage("Could not update Station Team visibility.");
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      setImportStatus("Paste some data first.");
      return;
    }

    setImportStatus("Processing...");

    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setImportStatus("No valid lines found.");
        return;
      }

      const firstLine = lines[0].toLowerCase();
      const hasHeader =
        firstLine.includes("employee") ||
        firstLine.includes("status") ||
        firstLine.includes("department") ||
        firstLine.includes("username");

      const startIndex = hasHeader ? 1 : 0;

      const existingUsernames = new Set(
        [
          ...employees.map((e) => e.loginUsername),
          ...users.map((u) => u.username || u.loginUsername),
        ]
          .map(normalizeText)
          .filter(Boolean)
      );

      const existingNames = new Set(
        employees
          .map((e) => normalizeText(getEmployeeDisplayName(e)))
          .filter(Boolean)
      );

      const batchUsernames = new Set();
      const batchNames = new Set();

      let createdCount = 0;
      let skippedDuplicates = 0;
      let skippedDuplicateNames = 0;
      let skippedInvalid = 0;

      for (let i = startIndex; i < lines.length; i++) {
        const row = lines[i];
        const cells = row.split(/[\t,;]+/).map((c) => c.trim());

        if (!cells[0]) continue;

        let employeeName = "";
        let loginUsername = "";
        let dept = "";
        let pos = "";
        let statusRaw = "Active";
        let notesVal = "";

        if (cells.length === 4) {
          employeeName = cells[0] || "";
          dept = cells[1] || "";
          pos = cells[2] || "";
          statusRaw = cells[3] || "Active";
        } else if (cells.length === 5) {
          employeeName = cells[0] || "";

          const secondCell = String(cells[1] || "").trim();
          const fourthCell = String(cells[3] || "").trim().toLowerCase();

          const looksLikeStatus =
            fourthCell === "active" || fourthCell === "inactive";

          const looksLikeUsername =
            secondCell &&
            !secondCell.includes(" ") &&
            !secondCell.toLowerCase().includes("service") &&
            !secondCell.toLowerCase().includes("ramp") &&
            !secondCell.toLowerCase().includes("bso") &&
            !secondCell.toLowerCase().includes("wchr") &&
            !secondCell.toLowerCase().includes("tc");

          if (looksLikeUsername && looksLikeStatus) {
            loginUsername = cells[1] || "";
            dept = cells[2] || "";
            pos = cells[3] || "";
            statusRaw = cells[4] || "Active";
          } else {
            dept = cells[1] || "";
            pos = cells[2] || "";
            statusRaw = cells[3] || "Active";
            notesVal = cells[4] || "";
          }
        } else if (cells.length >= 6) {
          employeeName = cells[0] || "";
          loginUsername = cells[1] || "";
          dept = cells[2] || "";
          pos = cells[3] || "";
          statusRaw = cells[4] || "Active";
          notesVal = cells.slice(5).join(", ") || "";
        } else {
          skippedInvalid++;
          continue;
        }

        const cleanEmployeeName = employeeName.trim();
        const cleanNameKey = normalizeText(cleanEmployeeName);

        if (!cleanEmployeeName) {
          skippedInvalid++;
          continue;
        }

        if (
          existingNames.has(cleanNameKey) ||
          batchNames.has(cleanNameKey)
        ) {
          skippedDuplicateNames++;
          continue;
        }

        batchNames.add(cleanNameKey);

        const normalizedStatus =
          String(statusRaw).toLowerCase() === "inactive"
            ? "Inactive"
            : "Active";

        const cleanUsername = String(loginUsername || "")
          .trim()
          .toLowerCase();

        if (cleanUsername) {
          const key = normalizeText(cleanUsername);

          if (
            existingUsernames.has(key) ||
            batchUsernames.has(key)
          ) {
            skippedDuplicates++;
            continue;
          }

          batchUsernames.add(key);
        }

        const ref = await addDoc(collection(db, "employees"), {
          name: cleanEmployeeName,
          loginUsername: cleanUsername || null,
          department: dept.trim() || null,
          position: pos.trim() || null,
          status: normalizedStatus,
          active: normalizedStatus === "Active",
          notes: notesVal.trim() || null,
          showInStationTeam: true,
          createdAt: new Date().toISOString(),
        });

        if (cleanUsername) {
          await syncUserLink(ref.id, cleanUsername);
        }

        createdCount++;
      }

      let msg = `Imported ${createdCount} employees successfully.`;

      if (skippedDuplicates > 0) {
        msg += ` Skipped ${skippedDuplicates} line(s) because username was already used.`;
      }

      if (skippedDuplicateNames > 0) {
        msg += ` Skipped ${skippedDuplicateNames} duplicate employee name(s).`;
      }

      if (skippedInvalid > 0) {
        msg += ` Skipped ${skippedInvalid} invalid line(s).`;
      }

      setImportStatus(msg);
      setBulkText("");
      await loadData();
    } catch (err) {
      console.error(err);
      setImportStatus("Error importing data. Check console for details.");
    }
  };

  const formSuccess = formMessage.toLowerCase().includes("success");
  const importSuccess = importStatus.toLowerCase().includes("imported");

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
        boxSizing: "border-box",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 18 : 24,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
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
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            minWidth: 0,
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
                fontSize: isMobile ? 24 : 30,
                lineHeight: 1.05,
                fontWeight: 850,
                letterSpacing: "-0.04em",
              }}
            >
              Employees
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 13,
                color: "rgba(255,255,255,0.86)",
              }}
            >
              Create and maintain employee profiles before station login
              accounts are assigned.
            </p>
          </div>
        </div>
      </div>

      <PageCard style={{ padding: isMobile ? 14 : 22 }}>
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
            {editingId ? "Edit Employee" : "Add Employee"}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Enter names as <b>Last Name / First Name</b>. The system will use
            that order when recommending the future login username.
          </p>
        </div>

        <form
          onSubmit={handleAddOrUpdateEmployee}
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: isMobile ? 12 : 14,
            minWidth: 0,
          }}
        >
          <div>
            <FieldLabel>Name - Last Name / First Name</FieldLabel>
            <TextInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormMessage("");
              }}
              placeholder="Napoles Alexis"
              required
            />

            {duplicateName && (
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
                {"\u26A0"} Possible duplicate employee:{" "}
                {getEmployeeDisplayName(duplicateName)}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Username (login)</FieldLabel>
            <TextInput
              value={username}
              onChange={(e) => {
                setUsername(
                  e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "")
                );
                setFormMessage("");
              }}
              placeholder="Optional until user account is created"
              autoCapitalize="none"
              autoCorrect="off"
            />

            {suggestedUsername && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1769aa",
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  Suggested: <b>{suggestedUsername}</b>
                </div>

                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setUsername(suggestedUsername)}
                >
                  Use
                </ActionButton>
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
                {"\u26A0"} Username already used by {duplicateUsername.label}.
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Position</FieldLabel>
            <TextInput
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Show in Station Team</FieldLabel>
            <SelectInput
              value={showInStationTeam ? "yes" : "no"}
              onChange={(e) =>
                setShowInStationTeam(e.target.value === "yes")
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </SelectInput>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Notes</FieldLabel>
            <TextArea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <ActionButton
              type="submit"
              variant="primary"
              disabled={Boolean(duplicateName || duplicateUsername)}
            >
              {editingId ? "Update Employee" : "Save Employee"}
            </ActionButton>

            {editingId && (
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleCancelEdit}
              >
                Cancel
              </ActionButton>
            )}
          </div>
        </form>

        {formMessage && (
          <div
            style={{
              marginTop: 14,
              background: formSuccess ? "#ecfdf5" : "#fff1f2",
              border: `1px solid ${
                formSuccess ? "#a7f3d0" : "#fecdd3"
              }`,
              borderRadius: 16,
              padding: "14px 16px",
              color: formSuccess ? "#065f46" : "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {formMessage}
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 22 }}>
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
            Import Employees
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Names should also be imported as <b>Last Name / First Name</b>.
            Duplicate names and usernames will be skipped automatically.
            <br />
            Accepted formats:
            <br />
            <code>Name, Department, Position, Status</code>
            <br />
            <code>Name, Department, Position, Status, Notes</code>
            <br />
            <code>Name, Username, Department, Position, Status</code>
            <br />
            <code>Name, Username, Department, Position, Status, Notes</code>
          </p>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <TextArea
            rows={7}
            placeholder={`Sanchez Liuvis, DL Cabin Service, Agent, Active
Pena Yanisleidys, DL Cabin Service, Agent, Active
Ramos Madeleivi, DL Cabin Service, Agent, Active
Castro Magalys, DL Cabin Service, Agent, Active`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <ActionButton onClick={handleBulkImport} variant="secondary">
              Import from pasted text
            </ActionButton>
          </div>

          {importStatus && (
            <div
              style={{
                background: importSuccess ? "#ecfdf5" : "#fff7ed",
                border: `1px solid ${
                  importSuccess ? "#a7f3d0" : "#fed7aa"
                }`,
                borderRadius: 16,
                padding: "14px 16px",
                color: importSuccess ? "#065f46" : "#9a3412",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {importStatus}
            </div>
          )}
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 12 : 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "minmax(220px, 1fr) minmax(180px, 260px)",
            gap: 10,
            minWidth: 0,
          }}
        >
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, username, department..."
          />

          <SelectInput
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </SelectInput>
        </div>
      </PageCard>

      <div style={{ display: "grid", gap: 18 }}>
        {groupedEmployees.length === 0 ? (
          <PageCard style={{ padding: 18 }}>
            <div
              style={{
                padding: "18px",
                textAlign: "center",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              No employees match the current filters.
            </div>
          </PageCard>
        ) : (
          groupedEmployees.map(([dept, deptEmployees]) => (
            <PageCard key={dept} style={{ padding: isMobile ? 12 : 18 }}>
              <div
                style={{
                  marginBottom: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#0f172a",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Department: {dept}
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    Total employees: {deptEmployees.length}
                  </p>
                </div>
              </div>

              {isMobile ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  {deptEmployees.map((e) => (
                    <EmployeeMobileCard
                      key={e.id}
                      employee={e}
                      suggestedUsername={
                        e.loginUsername
                          ? ""
                          : getUniqueSuggestion(
                              e.name,
                              new Set([
                                ...employees
                                  .filter((item) => item.id !== e.id)
                                  .map((item) => item.loginUsername)
                                  .filter(Boolean),
                                ...users
                                  .map((u) => u.username || u.loginUsername)
                                  .filter(Boolean),
                              ])
                            )
                      }
                      onEdit={() => handleStartEdit(e)}
                      onToggle={() => handleToggleStationTeam(e)}
                      onDelete={() => handleDelete(e.id)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                    maxWidth: "100%",
                    borderRadius: 18,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1120,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle({ textAlign: "left" })}>Last Initial</th>
                        <th style={thStyle({ textAlign: "left" })}>
                          Name (Last / First)
                        </th>
                        <th style={thStyle({ textAlign: "left" })}>Username</th>
                        <th style={thStyle({ textAlign: "left" })}>Position</th>
                        <th style={thStyle({ textAlign: "left" })}>Status</th>
                        <th style={thStyle({ textAlign: "left" })}>Station Team</th>
                        <th style={thStyle({ textAlign: "left" })}>Notes</th>
                        <th style={thStyle({ textAlign: "center" })}>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {deptEmployees.map((e, index) => (
                        <tr
                          key={e.id}
                          style={{
                            background:
                              index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>{getLastNameInitial(e)}</td>
                          <td style={tdStyle}>{e.name}</td>
                          <td style={tdStyle}>
                            {e.loginUsername || (
                              <span style={{ color: "#94a3b8" }}>
                                Suggested:{" "}
                                {getUniqueSuggestion(
                                  e.name,
                                  new Set([
                                    ...employees
                                      .filter((item) => item.id !== e.id)
                                      .map((item) => item.loginUsername)
                                      .filter(Boolean),
                                    ...users
                                      .map(
                                        (u) =>
                                          u.username || u.loginUsername
                                      )
                                      .filter(Boolean),
                                  ])
                                ) || "\u2014"}
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>{e.position || "\u2014"}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                background:
                                  (e.status ||
                                    (e.active ? "Active" : "Inactive")) ===
                                  "Active"
                                    ? "#ecfdf5"
                                    : "#fff1f2",
                                color:
                                  (e.status ||
                                    (e.active ? "Active" : "Inactive")) ===
                                  "Active"
                                    ? "#065f46"
                                    : "#9f1239",
                                border: `1px solid ${
                                  (e.status ||
                                    (e.active ? "Active" : "Inactive")) ===
                                  "Active"
                                    ? "#a7f3d0"
                                    : "#fecdd3"
                                }`,
                              }}
                            >
                              {e.status || (e.active ? "Active" : "Inactive")}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                background:
                                  e.showInStationTeam === false
                                    ? "#fff1f2"
                                    : "#ecfdf5",
                                color:
                                  e.showInStationTeam === false
                                    ? "#9f1239"
                                    : "#065f46",
                                border: `1px solid ${
                                  e.showInStationTeam === false
                                    ? "#fecdd3"
                                    : "#a7f3d0"
                                }`,
                              }}
                            >
                              {e.showInStationTeam === false
                                ? "Hidden"
                                : "Shown"}
                            </span>
                          </td>
                          <td style={tdStyle}>{e.notes || "\u2014"}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                justifyContent: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <ActionButton
                                type="button"
                                variant="secondary"
                                onClick={() => handleStartEdit(e)}
                              >
                                Edit
                              </ActionButton>

                              <ActionButton
                                type="button"
                                variant="warning"
                                onClick={() => handleToggleStationTeam(e)}
                              >
                                {e.showInStationTeam === false
                                  ? "Show"
                                  : "Hide"}
                              </ActionButton>

                              <ActionButton
                                type="button"
                                variant="danger"
                                onClick={() => handleDelete(e.id)}
                              >
                                Delete
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          ))
        )}
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "0 10px 8px",
          fontSize: 10.5,
          color: "#94a3b8",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

function EmployeeMobileCard({
  employee,
  suggestedUsername,
  onEdit,
  onToggle,
  onDelete,
}) {
  const isActive =
    (employee.status || (employee.active ? "Active" : "Inactive")) === "Active";
  const isShown = employee.showInStationTeam !== false;

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        background: "#ffffff",
        padding: 13,
        display: "grid",
        gap: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 850,
              color: "#0f172a",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {employee.name || "Unnamed"}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.45,
            }}
          >
            {employee.position || "No position"}
          </div>
        </div>

        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: "#eff6ff",
            color: "#1769aa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {getLastNameInitial(employee)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <MobileInfo label="Username">
          {employee.loginUsername || (
            <span style={{ color: "#1769aa" }}>
              {suggestedUsername ? `Suggested: ${suggestedUsername}` : "\u2014"}
            </span>
          )}
        </MobileInfo>

        <MobileInfo label="Department">
          {employee.department || "No Department"}
        </MobileInfo>

        <MobileInfo label="Status">
          <span
            style={{
              display: "inline-flex",
              padding: "4px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              background: isActive ? "#ecfdf5" : "#fff1f2",
              color: isActive ? "#065f46" : "#9f1239",
              border: `1px solid ${isActive ? "#a7f3d0" : "#fecdd3"}`,
            }}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </MobileInfo>

        <MobileInfo label="Station Team">
          <span
            style={{
              display: "inline-flex",
              padding: "4px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              background: isShown ? "#ecfdf5" : "#fff1f2",
              color: isShown ? "#065f46" : "#9f1239",
              border: `1px solid ${isShown ? "#a7f3d0" : "#fecdd3"}`,
            }}
          >
            {isShown ? "Shown" : "Hidden"}
          </span>
        </MobileInfo>
      </div>

      {employee.notes && (
        <div
          style={{
            padding: "9px 10px",
            borderRadius: 12,
            background: "#f8fafc",
            color: "#64748b",
            fontSize: 12,
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {employee.notes}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <ActionButton type="button" variant="secondary" onClick={onEdit}>
          Edit
        </ActionButton>

        <ActionButton type="button" variant="warning" onClick={onToggle}>
          {isShown ? "Hide" : "Show"}
        </ActionButton>

        <ActionButton type="button" variant="danger" onClick={onDelete}>
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

function MobileInfo({ label, children }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 12,
        background: "#f8fbff",
        border: "1px solid #e5eef8",
        padding: "9px 10px",
      }}
    >
      <div
        style={{
          marginBottom: 4,
          fontSize: 9.5,
          fontWeight: 850,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#334155",
          fontWeight: 700,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
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
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};

// END EmployeesPage
