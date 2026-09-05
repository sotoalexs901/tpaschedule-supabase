// src/pages/TimeOffStatusPublicPage.jsx
// Reused as AeroStation Hub Training Notices Management.

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);

    window.addEventListener("resize", onResize);

    return () =>
      window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 20,
        boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
        fontSize: 11,
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "secondary",
  disabled = false,
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#ffffff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    },
    danger: {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 12px",
        fontSize: 12.5,
        fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.62 : 1,
        whiteSpace: "nowrap",
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Management"
  );
}

function getEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.username ||
    "Employee"
  );
}

function formatDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "No due date";

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTodayKey() {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDaysUntilDue(value) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  const due = new Date(`${raw}T00:00:00`);
  const today = new Date(`${getTodayKey()}T00:00:00`);

  if (
    Number.isNaN(due.getTime()) ||
    Number.isNaN(today.getTime())
  ) {
    return null;
  }

  return Math.ceil(
    (due.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function getNoticeState(notice) {
  const storedStatus = normalizeText(
    notice?.status || "pending"
  );

  if (
    storedStatus === "completed" ||
    storedStatus === "complete"
  ) {
    return "completed";
  }

  const daysUntilDue = getDaysUntilDue(
    notice?.dueDate
  );

  if (
    daysUntilDue !== null &&
    daysUntilDue < 0
  ) {
    return "overdue";
  }

  if (
    daysUntilDue !== null &&
    daysUntilDue <= 7
  ) {
    return "due_soon";
  }

  return "pending";
}

function getStateLabel(state) {
  if (state === "completed") return "Completed";
  if (state === "overdue") return "Overdue";
  if (state === "due_soon") return "Due Soon";
  return "Pending";
}

function getStateStyle(state) {
  if (state === "completed") {
    return {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    };
  }

  if (state === "overdue") {
    return {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    };
  }

  if (state === "due_soon") {
    return {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    };
  }

  return {
    background: "#eff6ff",
    color: "#1769aa",
    border: "1px solid #bfdbfe",
  };
}

export default function TimeOffStatusPublicPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [employees, setEmployees] = useState([]);
  const [notices, setNotices] = useState([]);

  const [employeeId, setEmployeeId] = useState("");
  const [trainingName, setTrainingName] = useState("");
  const [trainingCategory, setTrainingCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [trainingLink, setTrainingLink] = useState("");

  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyNoticeId, setBusyNoticeId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const role = normalizeText(user?.role);

  const canAccess =
    role === "station_manager" ||
    role === "duty_manager" ||
    role === "admin";

  // ============================================================
  // EMPLOYEES
  // ============================================================

  useEffect(() => {
    if (!canAccess) {
      setEmployees([]);
      setLoadingEmployees(false);
      return;
    }

    async function loadEmployees() {
      try {
        setLoadingEmployees(true);

        const snap = await getDocs(
          collection(db, "employees")
        );

        const list = snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((employee) => {
            const name = getEmployeeName(employee);
            const status = normalizeText(
              employee.status ||
                (employee.active === false
                  ? "inactive"
                  : "active")
            );

            return (
              String(name).trim() &&
              status !== "inactive"
            );
          })
          .sort((a, b) =>
            getEmployeeName(a).localeCompare(
              getEmployeeName(b)
            )
          );

        setEmployees(list);
      } catch (err) {
        console.error(
          "Error loading employees for Training Notices:",
          err
        );

        setStatusMessage(
          "Could not load employees."
        );
      } finally {
        setLoadingEmployees(false);
      }
    }

    loadEmployees().catch(console.error);
  }, [canAccess]);

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) =>
          employee.id === employeeId
      ) || null,
    [employees, employeeId]
  );

  // ============================================================
  // LIVE TRAINING NOTICES
  // ============================================================

  useEffect(() => {
    if (!canAccess) {
      setNotices([]);
      setLoadingNotices(false);
      return undefined;
    }

    setLoadingNotices(true);

    const unsub = onSnapshot(
      collection(db, "training_notices"),
      (snap) => {
        const list = snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) => {
            const aArchived =
              normalizeText(a.visibility) ===
              "archived";

            const bArchived =
              normalizeText(b.visibility) ===
              "archived";

            if (aArchived !== bArchived) {
              return aArchived ? 1 : -1;
            }

            const aCompleted =
              getNoticeState(a) ===
              "completed";

            const bCompleted =
              getNoticeState(b) ===
              "completed";

            if (aCompleted !== bCompleted) {
              return aCompleted ? 1 : -1;
            }

            const aDue = String(
              a.dueDate || "9999-12-31"
            );

            const bDue = String(
              b.dueDate || "9999-12-31"
            );

            if (aDue !== bDue) {
              return aDue.localeCompare(bDue);
            }

            return (
              (b.createdAt?.seconds || 0) -
              (a.createdAt?.seconds || 0)
            );
          });

        setNotices(list);
        setLoadingNotices(false);
      },
      (err) => {
        console.error(
          "Error listening Training Notices:",
          err
        );

        setLoadingNotices(false);
        setStatusMessage(
          "Could not load Training Notices."
        );
      }
    );

    return () => unsub();
  }, [canAccess]);

  // ============================================================
  // CREATE NOTICE
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatusMessage("");

    if (!employeeId) {
      setStatusMessage(
        "Please select an employee."
      );
      return;
    }

    if (!trainingName.trim()) {
      setStatusMessage(
        "Training name is required."
      );
      return;
    }

    if (!dueDate) {
      setStatusMessage(
        "Due date is required."
      );
      return;
    }

    if (!selectedEmployee) {
      setStatusMessage(
        "Selected employee could not be found."
      );
      return;
    }

    try {
      setSubmitting(true);

      const duplicate = notices.some(
        (notice) =>
          notice.employeeId === employeeId &&
          normalizeText(notice.trainingName) ===
            normalizeText(trainingName) &&
          normalizeText(notice.visibility || "active") !==
            "archived" &&
          getNoticeState(notice) !==
            "completed"
      );

      if (duplicate) {
        setStatusMessage(
          "This employee already has an active notice for the same training."
        );
        return;
      }

      await addDoc(
        collection(db, "training_notices"),
        {
          employeeId,
          employeeName:
            getEmployeeName(selectedEmployee),

          department:
            selectedEmployee.department ||
            "",

          position:
            selectedEmployee.position ||
            "",

          employeeLoginUsername:
            selectedEmployee.loginUsername ||
            "",

          trainingName:
            trainingName.trim(),

          trainingCategory:
            trainingCategory.trim(),

          dueDate,

          message:
            message.trim(),

          trainingLink:
            trainingLink.trim(),

          status:
            "pending",

          visibility:
            "active",

          acknowledged:
            false,

          acknowledgedAt:
            null,

          assignedByUserId:
            user?.id ||
            "",

          assignedByUsername:
            user?.username ||
            user?.loginUsername ||
            "",

          assignedByName:
            getVisibleName(user),

          assignedByRole:
            user?.role ||
            "",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          pushStatus:
            "PENDING",
        }
      );

      setStatusMessage(
        "Training Notice created successfully."
      );

      setEmployeeId("");
      setTrainingName("");
      setTrainingCategory("");
      setDueDate("");
      setMessage("");
      setTrainingLink("");
    } catch (err) {
      console.error(
        "Error creating Training Notice:",
        err
      );

      setStatusMessage(
        "Could not create Training Notice. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // STATUS ACTIONS
  // ============================================================

  const updateNotice = async (
    notice,
    patch,
    successMessage
  ) => {
    if (!notice?.id) return;

    try {
      setBusyNoticeId(notice.id);
      setStatusMessage("");

      await updateDoc(
        doc(
          db,
          "training_notices",
          notice.id
        ),
        {
          ...patch,
          updatedAt:
            serverTimestamp(),
          updatedByUserId:
            user?.id ||
            "",
          updatedByUsername:
            user?.username ||
            user?.loginUsername ||
            "",
          updatedByName:
            getVisibleName(user),
        }
      );

      setStatusMessage(
        successMessage
      );
    } catch (err) {
      console.error(
        "Error updating Training Notice:",
        err
      );

      setStatusMessage(
        "Could not update Training Notice."
      );
    } finally {
      setBusyNoticeId("");
    }
  };

  const handleComplete = (notice) =>
    updateNotice(
      notice,
      {
        status: "completed",
        completedAt:
          serverTimestamp(),
        completedByUserId:
          user?.id ||
          "",
        completedByName:
          getVisibleName(user),
      },
      "Training marked as completed."
    );

  const handleReopen = (notice) =>
    updateNotice(
      notice,
      {
        status: "pending",
        completedAt: null,
        completedByUserId: "",
        completedByName: "",
      },
      "Training Notice reopened."
    );

  const handleArchive = (notice) => {
    if (
      !window.confirm(
        `Archive "${notice.trainingName || "Training Notice"}" for ${
          notice.employeeName || "this employee"
        }?`
      )
    ) {
      return;
    }

    updateNotice(
      notice,
      {
        visibility: "archived",
        archivedAt:
          serverTimestamp(),
      },
      "Training Notice archived."
    );
  };

  const handleRestore = (notice) =>
    updateNotice(
      notice,
      {
        visibility: "active",
        archivedAt: null,
      },
      "Training Notice restored."
    );

  // ============================================================
  // FILTERS / COUNTS
  // ============================================================

  const counts = useMemo(() => {
    const result = {
      pending: 0,
      dueSoon: 0,
      overdue: 0,
      completed: 0,
      unacknowledged: 0,
    };

    notices.forEach((notice) => {
      if (
        normalizeText(
          notice.visibility || "active"
        ) === "archived"
      ) {
        return;
      }

      const state = getNoticeState(notice);

      if (state === "completed") {
        result.completed += 1;
      } else if (state === "overdue") {
        result.overdue += 1;
      } else if (state === "due_soon") {
        result.dueSoon += 1;
      } else {
        result.pending += 1;
      }

      if (
        notice.acknowledged !== true &&
        !notice.acknowledgedAt
      ) {
        result.unacknowledged += 1;
      }
    });

    return result;
  }, [notices]);

  const filteredNotices = useMemo(() => {
    const searchKey =
      normalizeText(search);

    return notices.filter((notice) => {
      const visibility =
        normalizeText(
          notice.visibility || "active"
        );

      const state =
        getNoticeState(notice);

      if (
        employeeFilter !== "ALL" &&
        notice.employeeId !==
          employeeFilter
      ) {
        return false;
      }

      if (
        statusFilter === "ACTIVE" &&
        visibility === "archived"
      ) {
        return false;
      }

      if (
        statusFilter === "ARCHIVED" &&
        visibility !== "archived"
      ) {
        return false;
      }

      if (
        statusFilter === "PENDING" &&
        (
          visibility === "archived" ||
          state !== "pending"
        )
      ) {
        return false;
      }

      if (
        statusFilter === "DUE_SOON" &&
        (
          visibility === "archived" ||
          state !== "due_soon"
        )
      ) {
        return false;
      }

      if (
        statusFilter === "OVERDUE" &&
        (
          visibility === "archived" ||
          state !== "overdue"
        )
      ) {
        return false;
      }

      if (
        statusFilter === "COMPLETED" &&
        (
          visibility === "archived" ||
          state !== "completed"
        )
      ) {
        return false;
      }

      if (!searchKey) {
        return true;
      }

      const haystack = [
        notice.employeeName,
        notice.trainingName,
        notice.trainingCategory,
        notice.department,
        notice.position,
        notice.message,
        notice.assignedByName,
      ]
        .map(normalizeText)
        .join(" ");

      return haystack.includes(searchKey);
    });
  }, [
    notices,
    employeeFilter,
    statusFilter,
    search,
  ]);

  // ============================================================
  // ACCESS CONTROL
  // ============================================================

  if (!user) {
    return (
      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 18,
            padding: "16px 18px",
            color: "#9f1239",
            fontWeight: 800,
          }}
        >
          You must be signed in to access Training Notices Management.
        </div>
      </PageCard>
    );
  }

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 18,
            padding: "16px 18px",
            color: "#9f1239",
            fontWeight: 800,
          }}
        >
          Only Station Managers, Duty Managers and authorized Admin users can
          access Training Notices Management.
        </div>
      </PageCard>
    );
  }

  const todayStr = getTodayKey();

  const isSuccess =
    statusMessage
      .toLowerCase()
      .includes("success") ||
    statusMessage
      .toLowerCase()
      .includes("completed") ||
    statusMessage
      .toLowerCase()
      .includes("reopened") ||
    statusMessage
      .toLowerCase()
      .includes("archived") ||
    statusMessage
      .toLowerCase()
      .includes("restored");

  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #071c33 0%, #0f4c81 48%, #1769aa 72%, #62c4ef 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding:
            isMobile
              ? 18
              : 24,
          color: "#ffffff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
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
            background:
              "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            justifyContent:
              "space-between",
            gap: 16,
            alignItems:
              isMobile
                ? "stretch"
                : "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 13,
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                overflow: "hidden",
                background: "#ffffff",
                border:
                  "1px solid rgba(255,255,255,0.86)",
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
                  letterSpacing: "0.16em",
                  color:
                    "rgba(255,255,255,0.76)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Training Management
              </p>

              <h1
                style={{
                  margin: "6px 0 4px",
                  fontSize:
                    isMobile
                      ? 24
                      : 30,
                  lineHeight: 1.05,
                  fontWeight: 900,
                  letterSpacing:
                    "-0.04em",
                }}
              >
                Training Notices
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: 680,
                  fontSize: 13,
                  color:
                    "rgba(255,255,255,0.88)",
                  lineHeight: 1.5,
                }}
              >
                Assign pending trainings directly to employees and monitor
                acknowledgment, due dates and completion status.
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.70)",
                  fontWeight: 700,
                }}
              >
                {APP_SUBTITLE}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(78px, 1fr))",
              gap: 7,
              minWidth:
                isMobile
                  ? 0
                  : 350,
            }}
          >
            <HeroStat
              label="Pending"
              value={counts.pending}
            />
            <HeroStat
              label="Due Soon"
              value={counts.dueSoon}
            />
            <HeroStat
              label="Overdue"
              value={counts.overdue}
            />
            <HeroStat
              label="Completed"
              value={counts.completed}
            />
          </div>
        </div>
      </div>

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 20,
        }}
      >
        <div
          style={{
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing:
                "-0.02em",
            }}
          >
            Assign Training Notice
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            The notice will appear automatically in the employee's Training
            Notices page.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",
            gap: 13,
          }}
        >
          <div>
            <FieldLabel>
              Employee
            </FieldLabel>

            <SelectInput
              value={employeeId}
              disabled={
                loadingEmployees ||
                submitting
              }
              onChange={(event) =>
                setEmployeeId(
                  event.target.value
                )
              }
            >
              <option value="">
                {loadingEmployees
                  ? "Loading employees..."
                  : "Select employee"}
              </option>

              {employees.map(
                (employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {getEmployeeName(
                      employee
                    )}
                    {employee.department
                      ? ` - ${employee.department}`
                      : ""}
                  </option>
                )
              )}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Training Name
            </FieldLabel>

            <TextInput
              value={trainingName}
              disabled={submitting}
              onChange={(event) =>
                setTrainingName(
                  event.target.value
                )
              }
              placeholder="Aviation Security Awareness"
            />
          </div>

          <div>
            <FieldLabel>
              Training Category
            </FieldLabel>

            <TextInput
              value={trainingCategory}
              disabled={submitting}
              onChange={(event) =>
                setTrainingCategory(
                  event.target.value
                )
              }
              placeholder="Security, Safety, Airline, Compliance..."
            />
          </div>

          <div>
            <FieldLabel>
              Due Date
            </FieldLabel>

            <TextInput
              type="date"
              value={dueDate}
              min={todayStr}
              disabled={submitting}
              onChange={(event) =>
                setDueDate(
                  event.target.value
                )
              }
            />
          </div>

          <div
            style={{
              gridColumn:
                "1 / -1",
            }}
          >
            <FieldLabel>
              Instructions / Message
            </FieldLabel>

            <TextArea
              rows={4}
              value={message}
              disabled={submitting}
              onChange={(event) =>
                setMessage(
                  event.target.value
                )
              }
              placeholder="Please complete this training before the due date. Contact Management if you need assistance."
            />
          </div>

          <div
            style={{
              gridColumn:
                "1 / -1",
            }}
          >
            <FieldLabel>
              Training Link (optional)
            </FieldLabel>

            <TextInput
              type="url"
              value={trainingLink}
              disabled={submitting}
              onChange={(event) =>
                setTrainingLink(
                  event.target.value
                )
              }
              placeholder="https://..."
            />
          </div>

          {selectedEmployee && (
            <div
              style={{
                gridColumn:
                  "1 / -1",
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                borderRadius: 14,
                padding:
                  "11px 12px",
                color: "#475569",
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              <strong>
                Selected:
              </strong>{" "}
              {getEmployeeName(
                selectedEmployee
              )}
              {selectedEmployee.position
                ? ` \u00B7 ${selectedEmployee.position}`
                : ""}
              {selectedEmployee.department
                ? ` \u00B7 ${selectedEmployee.department}`
                : ""}
            </div>
          )}

          <div
            style={{
              gridColumn:
                "1 / -1",
            }}
          >
            <ActionButton
              type="submit"
              variant="primary"
              disabled={
                submitting ||
                loadingEmployees
              }
            >
              {submitting
                ? "Assigning..."
                : "Assign Training Notice"}
            </ActionButton>
          </div>
        </form>
      </PageCard>

      {statusMessage && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              padding: "11px 12px",
              background:
                isSuccess
                  ? "#ecfdf5"
                  : "#fff7ed",
              border:
                isSuccess
                  ? "1px solid #a7f3d0"
                  : "1px solid #fed7aa",
              color:
                isSuccess
                  ? "#065f46"
                  : "#9a3412",
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard
        style={{
          padding:
            isMobile
              ? 13
              : 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "minmax(220px, 1fr) minmax(190px, 250px) minmax(170px, 220px)",
            gap: 9,
          }}
        >
          <TextInput
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search employee or training..."
          />

          <SelectInput
            value={employeeFilter}
            onChange={(event) =>
              setEmployeeFilter(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Employees
            </option>

            {employees.map(
              (employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {getEmployeeName(
                    employee
                  )}
                </option>
              )
            )}
          </SelectInput>

          <SelectInput
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="ACTIVE">
              Active
            </option>
            <option value="PENDING">
              Pending
            </option>
            <option value="DUE_SOON">
              Due Soon
            </option>
            <option value="OVERDUE">
              Overdue
            </option>
            <option value="COMPLETED">
              Completed
            </option>
            <option value="ARCHIVED">
              Archived
            </option>
            <option value="ALL">
              All
            </option>
          </SelectInput>
        </div>
      </PageCard>

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
                letterSpacing:
                  "-0.02em",
              }}
            >
              Training Notices
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Showing {filteredNotices.length} notice
              {filteredNotices.length === 1 ? "" : "s"}.
            </p>
          </div>

          {counts.unacknowledged > 0 && (
            <div
              style={{
                padding:
                  "7px 10px",
                borderRadius: 999,
                background:
                  "#fff7ed",
                border:
                  "1px solid #fed7aa",
                color:
                  "#9a3412",
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {counts.unacknowledged} not acknowledged
            </div>
          )}
        </div>

        {loadingNotices ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Loading Training Notices...
          </div>
        ) : filteredNotices.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              border:
                "1px solid #dbeafe",
              background:
                "#f8fbff",
              borderRadius: 14,
              color: "#64748b",
              fontSize: 13,
            }}
          >
            No Training Notices match the current filters.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            {filteredNotices.map(
              (notice) => {
                const state =
                  getNoticeState(
                    notice
                  );

                const stateStyle =
                  getStateStyle(
                    state
                  );

                const archived =
                  normalizeText(
                    notice.visibility ||
                      "active"
                  ) === "archived";

                const acknowledged =
                  notice.acknowledged ===
                    true ||
                  Boolean(
                    notice.acknowledgedAt
                  );

                const busy =
                  busyNoticeId ===
                  notice.id;

                return (
                  <div
                    key={notice.id}
                    style={{
                      border:
                        archived
                          ? "1px solid #cbd5e1"
                          : state === "overdue"
                          ? "1px solid #fecdd3"
                          : state === "due_soon"
                          ? "1px solid #fed7aa"
                          : "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding:
                        isMobile
                          ? 12
                          : 14,
                      background:
                        archived
                          ? "#f8fafc"
                          : "#ffffff",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection:
                          isMobile
                            ? "column"
                            : "row",
                        justifyContent:
                          "space-between",
                        alignItems:
                          isMobile
                            ? "stretch"
                            : "flex-start",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 900,
                            color: "#0f172a",
                            lineHeight: 1.35,
                          }}
                        >
                          {notice.employeeName ||
                            "Employee"}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 13,
                            fontWeight: 850,
                            color: "#1769aa",
                            lineHeight: 1.4,
                          }}
                        >
                          {notice.trainingName ||
                            "Training Required"}
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            fontSize: 11.5,
                            color: "#64748b",
                            lineHeight: 1.55,
                          }}
                        >
                          Due:{" "}
                          <strong>
                            {formatDate(
                              notice.dueDate
                            )}
                          </strong>
                          {notice.trainingCategory
                            ? ` \u00B7 ${notice.trainingCategory}`
                            : ""}
                          {notice.department
                            ? ` \u00B7 ${notice.department}`
                            : ""}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            ...stateStyle,
                            display:
                              "inline-flex",
                            padding:
                              "6px 9px",
                            borderRadius: 999,
                            fontSize: 10.5,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getStateLabel(
                            state
                          )}
                        </span>

                        <span
                          style={{
                            display:
                              "inline-flex",
                            padding:
                              "6px 9px",
                            borderRadius: 999,
                            fontSize: 10.5,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            background:
                              acknowledged
                                ? "#ecfdf5"
                                : "#fff7ed",
                            border:
                              acknowledged
                                ? "1px solid #a7f3d0"
                                : "1px solid #fed7aa",
                            color:
                              acknowledged
                                ? "#065f46"
                                : "#9a3412",
                          }}
                        >
                          {acknowledged
                            ? "Acknowledged"
                            : "Not Acknowledged"}
                        </span>

                        {archived && (
                          <span
                            style={{
                              display:
                                "inline-flex",
                              padding:
                                "6px 9px",
                              borderRadius: 999,
                              fontSize: 10.5,
                              fontWeight: 900,
                              background:
                                "#f1f5f9",
                              border:
                                "1px solid #cbd5e1",
                              color:
                                "#475569",
                            }}
                          >
                            Archived
                          </span>
                        )}
                      </div>
                    </div>

                    {notice.message && (
                      <div
                        style={{
                          padding:
                            "9px 10px",
                          borderRadius: 12,
                          background:
                            "#f8fbff",
                          border:
                            "1px solid #dbeafe",
                          color:
                            "#475569",
                          fontSize: 12,
                          lineHeight: 1.55,
                          whiteSpace:
                            "pre-line",
                        }}
                      >
                        {notice.message}
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      {!archived &&
                        state !==
                          "completed" && (
                          <ActionButton
                            variant="success"
                            disabled={busy}
                            onClick={() =>
                              handleComplete(
                                notice
                              )
                            }
                          >
                            Mark Completed
                          </ActionButton>
                        )}

                      {!archived &&
                        state ===
                          "completed" && (
                          <ActionButton
                            variant="warning"
                            disabled={busy}
                            onClick={() =>
                              handleReopen(
                                notice
                              )
                            }
                          >
                            Reopen
                          </ActionButton>
                        )}

                      {!archived ? (
                        <ActionButton
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            handleArchive(
                              notice
                            )
                          }
                        >
                          Archive
                        </ActionButton>
                      ) : (
                        <ActionButton
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            handleRestore(
                              notice
                            )
                          }
                        >
                          Restore
                        </ActionButton>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </PageCard>
    </div>
  );
}

function HeroStat({
  label,
  value,
}) {
  return (
    <div
      style={{
        background:
          "rgba(255,255,255,0.14)",
        border:
          "1px solid rgba(255,255,255,0.16)",
        borderRadius: 13,
        padding:
          "8px 9px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.05em",
          color:
            "rgba(255,255,255,0.72)",
          fontWeight: 800,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 3,
          fontSize: 20,
          lineHeight: 1,
          fontWeight: 900,
          color: "#ffffff",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// END TimeOffStatusPublicPage
