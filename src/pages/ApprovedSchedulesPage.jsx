// src/pages/ApprovedSchedulesPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  sendApprovedScheduleNotifications,
  sendLastMinuteScheduleChange,
} from "../utils/schedulePush.js";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateString(value) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
  }

  const dashMatch = raw.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/
  );

  if (dashMatch) {
    const [, mm, dd, yyyy] = dashMatch;
    return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(
      parsed.getMonth() + 1
    )}-${pad2(parsed.getDate())}`;
  }

  return "";
}

function buildDayNumbersFromWeekStart(weekStart) {
  const normalized =
    normalizeDateString(weekStart);

  if (!normalized) return null;

  const base =
    new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const result = {};

  DAY_KEYS.forEach((key, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);

    result[key] =
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
        d.getDate()
      ).padStart(2, "0")}`;
  });

  return result;
}

function buildWeekTextFromDays(days) {
  if (!days) return "Week not specified";

  return DAY_KEYS.map((key) => {
    const num = days[key];
    const label = DAY_LABELS[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

function buildWeekText(schedule) {
  const fromWeekStart =
    buildDayNumbersFromWeekStart(
      schedule?.weekStart
    );

  if (fromWeekStart) {
    return buildWeekTextFromDays(
      fromWeekStart
    );
  }

  if (schedule?.days) {
    return buildWeekTextFromDays(
      schedule.days
    );
  }

  return "Week not specified";
}

function formatWeekTagLabel(weekTag) {
  if (
    !weekTag ||
    weekTag === "no-week"
  ) {
    return "Unspecified week";
  }

  const normalized =
    normalizeDateString(weekTag);

  if (!normalized) return weekTag;

  const d =
    new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return weekTag;
  }

  return d.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getUserName(user) {
  return (
    user?.employeeName ||
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function getUserDepartment(user) {
  return String(
    user?.department ||
      user?.dept ||
      ""
  ).trim();
}

function PageCard({
  children,
  style = {},
}) {
  return (
    <div
      style={{
        background:
          "rgba(255,255,255,0.92)",
        border:
          "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow:
          "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow:
        "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border:
        "1px solid #cfe7fb",
      boxShadow: "none",
    },
    warning: {
      background:
        "linear-gradient(135deg, #b45309 0%, #d97706 58%, #f59e0b 100%)",
      color: "#ffffff",
      border: "none",
      boxShadow:
        "0 12px 24px rgba(217,119,6,0.16)",
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
        cursor:
          disabled
            ? "not-allowed"
            : "pointer",
        whiteSpace: "nowrap",
        opacity:
          disabled
            ? 0.6
            : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function DistributionModal({
  mode,
  weekTag,
  schedules,
  users,
  history,
  onClose,
  onSent,
}) {
  const isLastMinute =
    mode === "last_minute";

  const recipientGroups =
    useMemo(() => {
      const actualDepartments = Array.from(
        new Set(
          users
            .map((item) =>
              getUserDepartment(item)
            )
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b)
      );

      return [
        "Duty Managers",
        "Station Management / Admin",
        ...actualDepartments,
      ];
    }, [users]);

  const [department, setDepartment] =
    useState(
      recipientGroups[0] || ""
    );

  const [selectedUserIds, setSelectedUserIds] =
    useState([]);

  const [message, setMessage] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    setSelectedUserIds([]);
  }, [department]);

  const visibleUsers =
    useMemo(() => {
      const cleanDepartment =
        normalizeText(department);

      return users
        .filter((item) => {
          const role = normalizeText(
            item?.role
          );

          const itemDepartment =
            normalizeText(
              getUserDepartment(item)
            );

          if (
            cleanDepartment ===
            "duty managers"
          ) {
            return (
              role ===
              "duty_manager"
            );
          }

          if (
            cleanDepartment ===
            "station management / admin"
          ) {
            return (
              role ===
                "station_manager" ||
              role ===
                "admin"
            );
          }

          if (!cleanDepartment) {
            return true;
          }

          return (
            itemDepartment ===
            cleanDepartment
          );
        })
        .sort((a, b) =>
          getUserName(a).localeCompare(
            getUserName(b)
          )
        );
    }, [
      users,
      department,
    ]);

  const allVisibleSelected =
    visibleUsers.length > 0 &&
    visibleUsers.every((item) =>
      selectedUserIds.includes(item.id)
    );

  const toggleUser = (userId) => {
    setSelectedUserIds(
      (current) =>
        current.includes(userId)
          ? current.filter(
              (id) =>
                id !== userId
            )
          : [
              ...current,
              userId,
            ]
    );
  };

  const toggleAll = () => {
    const visibleIds =
      visibleUsers.map(
        (item) => item.id
      );

    if (allVisibleSelected) {
      setSelectedUserIds(
        (current) =>
          current.filter(
            (id) =>
              !visibleIds.includes(id)
          )
      );
      return;
    }

    setSelectedUserIds(
      (current) =>
        Array.from(
          new Set([
            ...current,
            ...visibleIds,
          ])
        )
    );
  };

  const handleSend =
    async () => {
      setError("");

      if (!selectedUserIds.length) {
        setError(
          "Select at least one employee."
        );
        return;
      }

      if (
        isLastMinute &&
        !message.trim()
      ) {
        setError(
          "Enter the last-minute change message."
        );
        return;
      }

      const confirmText =
        isLastMinute
          ? `Send this last-minute schedule change to ${selectedUserIds.length} selected employee(s)?`
          : `Notify ${selectedUserIds.length} selected employee(s) that this week's schedule is available?`;

      if (
        !window.confirm(
          confirmText
        )
      ) {
        return;
      }

      try {
        setSending(true);

        const payload = {
          weekStart:
            normalizeDateString(
              weekTag
            ),
          userIds:
            selectedUserIds,
          scheduleIds:
            schedules.map(
              (item) =>
                item.id
            ),
          departments:
            department
              ? [department]
              : [],
        };

        const result =
          isLastMinute
            ? await sendLastMinuteScheduleChange({
                ...payload,
                message:
                  message.trim(),
              })
            : await sendApprovedScheduleNotifications(
                payload
              );

        onSent(
          isLastMinute
            ? `Last-minute change sent to ${result.sentUserCount || 0} employee(s).`
            : `${result.sentUserCount || 0} employee(s) notified. ${
                result.alreadySentUserIds?.length
                  ? `${result.alreadySentUserIds.length} already notified and skipped.`
                  : ""
              }`
        );
      } catch (sendError) {
        console.error(
          "Schedule notification error:",
          sendError
        );

        setError(
          sendError?.message ||
            "Could not send notification."
        );
      } finally {
        setSending(false);
      }
    };

  const relevantHistory =
    history
      .filter(
        (item) =>
          item.weekStart ===
            normalizeDateString(
              weekTag
            ) &&
          item.type ===
            (isLastMinute
              ? "last_minute_change"
              : "approved_schedule")
      )
      .slice(0, 8);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background:
          "rgba(15,23,42,0.58)",
        backdropFilter:
          "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent:
          "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) =>
          e.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 24,
          border:
            "1px solid #e2e8f0",
          boxShadow:
            "0 30px 80px rgba(15,23,42,0.28)",
        }}
      >
        <div
          style={{
            padding: 18,
            background:
              isLastMinute
                ? "linear-gradient(135deg,#78350f 0%,#b45309 55%,#f59e0b 100%)"
                : "linear-gradient(135deg,#073b66 0%,#0f5c91 55%,#2e9fd6 100%)",
            color: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              gap: 12,
              alignItems:
                "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.1em",
                  opacity: 0.75,
                  fontWeight: 800,
                }}
              >
                {isLastMinute
                  ? "Last Minute Change"
                  : "Approved Schedule Distribution"}
              </div>

              <h2
                style={{
                  margin:
                    "5px 0 0",
                  fontSize: 20,
                  lineHeight: 1.2,
                }}
              >
                Week:{" "}
                {buildWeekText(
                  schedules[0]
                )}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border:
                  "1px solid rgba(255,255,255,0.24)",
                background:
                  "rgba(255,255,255,0.12)",
                color: "#fff",
                fontSize: 19,
                cursor: "pointer",
              }}
            >
              {"\u00D7"}
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 18,
            display: "grid",
            gap: 16,
          }}
        >
          {isLastMinute && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 850,
                  color: "#475569",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.05em",
                }}
              >
                Change Message
              </label>

              <textarea
                rows={4}
                value={message}
                onChange={(e) =>
                  setMessage(
                    e.target.value
                  )
                }
                placeholder="Example: Due to operational coverage, some shifts were modified. Please review your updated schedule."
                style={{
                  width: "100%",
                  boxSizing:
                    "border-box",
                  border:
                    "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: 12,
                  fontFamily:
                    "inherit",
                  fontSize: 13,
                  resize:
                    "vertical",
                }}
              />
            </div>
          )}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 11,
                fontWeight: 850,
                color: "#475569",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.05em",
              }}
            >
              Recipient Group / Department
            </label>

            <select
              value={department}
              onChange={(e) =>
                setDepartment(
                  e.target.value
                )
              }
              style={{
                width: "100%",
                border:
                  "1px solid #dbeafe",
                borderRadius: 12,
                padding:
                  "11px 12px",
                background:
                  "#ffffff",
                fontSize: 13,
                color: "#0f172a",
              }}
            >
              {recipientGroups.map(
                (dept) => (
                  <option
                    key={dept}
                    value={dept}
                  >
                    {dept}
                  </option>
                )
              )}
            </select>

            <div
              style={{
                marginTop: 7,
                fontSize: 10.5,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Employee departments come from the Employees page and are linked to each login account for Push delivery.
              Duty Managers and Station Management / Admin are also grouped automatically by role.
            </div>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 10,
                alignItems:
                  "center",
                marginBottom: 8,
                flexWrap:
                  "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  color: "#0f172a",
                }}
              >
                Employees{" "}
                <span
                  style={{
                    color:
                      "#64748b",
                    fontWeight: 700,
                  }}
                >
                  ({selectedUserIds.length} selected)
                </span>
              </div>

              <button
                type="button"
                onClick={toggleAll}
                disabled={
                  !visibleUsers.length
                }
                style={{
                  border:
                    "1px solid #bfdbfe",
                  background:
                    "#eff6ff",
                  color:
                    "#1d4ed8",
                  borderRadius: 10,
                  padding:
                    "7px 10px",
                  fontWeight: 800,
                  fontSize: 11,
                  cursor:
                    visibleUsers.length
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                {allVisibleSelected
                  ? "Clear All"
                  : "Select All"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 7,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {visibleUsers.length ===
              0 ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border:
                      "1px dashed #cbd5e1",
                    color:
                      "#64748b",
                    textAlign:
                      "center",
                    fontSize: 12,
                  }}
                >
                  No users found for this group.
                </div>
              ) : (
                visibleUsers.map(
                  (employee) => {
                    const selected =
                      selectedUserIds.includes(
                        employee.id
                      );

                    return (
                      <label
                        key={
                          employee.id
                        }
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap: 10,
                          padding:
                            "10px 11px",
                          borderRadius:
                            12,
                          border:
                            selected
                              ? "1px solid #93c5fd"
                              : "1px solid #e2e8f0",
                          background:
                            selected
                              ? "#eff6ff"
                              : "#ffffff",
                          cursor:
                            "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            selected
                          }
                          onChange={() =>
                            toggleUser(
                              employee.id
                            )
                          }
                          style={{
                            width: 18,
                            height: 18,
                            accentColor:
                              "#1769aa",
                          }}
                        />

                        <div>
                          <div
                            style={{
                              fontSize:
                                12.5,
                              fontWeight:
                                850,
                              color:
                                "#0f172a",
                            }}
                          >
                            {getUserName(
                              employee
                            )}
                          </div>

                          <div
                            style={{
                              marginTop:
                                2,
                              fontSize:
                                10.5,
                              color:
                                "#64748b",
                            }}
                          >
                            {employee.position ||
                              employee.role ||
                              "User"}
                            {employee.username
                              ? ` \u00B7 @${employee.username}`
                              : ""}
                          </div>
                        </div>
                      </label>
                    );
                  }
                )
              )}
            </div>
          </div>

          {error && (
            <div
              style={{
                borderRadius: 12,
                background:
                  "#fff1f2",
                border:
                  "1px solid #fecdd3",
                color:
                  "#be123c",
                padding:
                  "10px 12px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          {relevantHistory.length >
            0 && (
            <div
              style={{
                borderTop:
                  "1px solid #e2e8f0",
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 850,
                  color: "#475569",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.05em",
                  marginBottom: 7,
                }}
              >
                Recent History
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 6,
                }}
              >
                {relevantHistory.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      style={{
                        borderRadius:
                          11,
                        background:
                          "#f8fafc",
                        border:
                          "1px solid #e2e8f0",
                        padding:
                          "9px 10px",
                        fontSize:
                          10.5,
                        color:
                          "#475569",
                      }}
                    >
                      Sent:{" "}
                      <b>
                        {Array.isArray(
                          item.sentUserIds
                        )
                          ? item.sentUserIds.length
                          : item.successCount ||
                            0}
                      </b>{" "}
                      employee(s)
                      {item.message
                        ? ` \u00B7 ${item.message}`
                        : ""}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent:
                "flex-end",
              gap: 8,
              flexWrap:
                "wrap",
            }}
          >
            <ActionButton
              variant="secondary"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </ActionButton>

            <ActionButton
              variant={
                isLastMinute
                  ? "warning"
                  : "primary"
              }
              onClick={handleSend}
              disabled={sending}
            >
              {sending
                ? "Sending..."
                : isLastMinute
                ? "Send Last Minute Change"
                : "Notify Employees"}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApprovedSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [loading, setLoading] =
    useState(false);

  const [groups, setGroups] =
    useState({});

  const [users, setUsers] =
    useState([]);

  const [history, setHistory] =
    useState([]);

  const [statusMessage, setStatusMessage] =
    useState("");

  const [distributionModal, setDistributionModal] =
    useState(null);

  const canDistribute =
    normalizeText(
      user?.role
    ) ===
    "station_manager";

  const load = async () => {
    setLoading(true);
    setStatusMessage("");

    try {
      const [
        approvedSnap,
        employeesSnap,
        usersSnap,
        historySnap,
      ] = await Promise.all([
        getDocs(
          query(
            collection(
              db,
              "schedules"
            ),
            where(
              "status",
              "==",
              "approved"
            )
          )
        ),
        getDocs(
          collection(
            db,
            "employees"
          )
        ),
        getDocs(
          collection(
            db,
            "users"
          )
        ),
        getDocs(
          collection(
            db,
            "schedule_notification_batches"
          )
        ),
      ]);

      const items =
        approvedSnap.docs.map(
          (d) => {
            const data =
              d.data();

            const normalizedWeekStart =
              normalizeDateString(
                data.weekStart
              ) ||
              normalizeDateString(
                data.weekTag
              ) ||
              "";

            return {
              id: d.id,
              ...data,
              weekStart:
                normalizedWeekStart,
              weekTag:
                normalizedWeekStart ||
                "no-week",
            };
          }
        );

      const grouped = {};

      items.forEach((sch) => {
        const key =
          sch.weekTag ||
          "no-week";

        if (!grouped[key]) {
          grouped[key] = [];
        }

        grouped[key].push(
          sch
        );
      });

      Object.keys(
        grouped
      ).forEach((key) => {
        grouped[key].sort(
          (a, b) => {
            const airlineA =
              String(
                a.airline || ""
              ).toLowerCase();

            const airlineB =
              String(
                b.airline || ""
              ).toLowerCase();

            if (
              airlineA !==
              airlineB
            ) {
              return airlineA.localeCompare(
                airlineB
              );
            }

            const deptA =
              String(
                a.department ||
                  ""
              ).toLowerCase();

            const deptB =
              String(
                b.department ||
                  ""
              ).toLowerCase();

            return deptA.localeCompare(
              deptB
            );
          }
        );
      });

      const sortedGrouped =
        Object.fromEntries(
          Object.entries(
            grouped
          ).sort((a, b) => {
            if (
              a[0] ===
              "no-week"
            ) {
              return 1;
            }

            if (
              b[0] ===
              "no-week"
            ) {
              return -1;
            }

            return b[0].localeCompare(
              a[0]
            );
          })
        );

      setGroups(
        sortedGrouped
      );

      const userRecords =
        usersSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        );

      const employeeRecords =
        employeesSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        );

      const usersByEmployeeId =
        new Map();

      const usersByUsername =
        new Map();

      userRecords.forEach(
        (account) => {
          const employeeId =
            String(
              account.employeeId || ""
            ).trim();

          const username =
            normalizeText(
              account.username ||
                account.loginUsername
            );

          if (employeeId) {
            usersByEmployeeId.set(
              employeeId,
              account
            );
          }

          if (username) {
            usersByUsername.set(
              username,
              account
            );
          }
        }
      );

      const linkedUserIds =
        new Set();

      const employeeRecipients =
        employeeRecords
          .map((employee) => {
            const employeeUsername =
              normalizeText(
                employee.loginUsername
              );

            const linkedUser =
              usersByEmployeeId.get(
                employee.id
              ) ||
              (employeeUsername
                ? usersByUsername.get(
                    employeeUsername
                  )
                : null);

            if (!linkedUser) {
              return null;
            }

            linkedUserIds.add(
              linkedUser.id
            );

            return {
              ...linkedUser,
              id: linkedUser.id,

              employeeId:
                employee.id,

              employeeName:
                employee.name ||
                linkedUser.employeeName ||
                linkedUser.displayName ||
                linkedUser.fullName ||
                "",

              displayName:
                employee.name ||
                linkedUser.displayName ||
                linkedUser.fullName ||
                linkedUser.name ||
                "",

              department:
                employee.department ||
                linkedUser.department ||
                "",

              position:
                employee.position ||
                linkedUser.position ||
                "",

              employeeStatus:
                employee.status ||
                (employee.active === false
                  ? "Inactive"
                  : "Active"),

              employeeActive:
                employee.active !== false &&
                normalizeText(
                  employee.status
                ) !== "inactive",
            };
          })
          .filter(Boolean)
          .filter(
            (recipient) =>
              recipient.employeeActive !==
              false
          );

      const unmatchedUserRecipients =
        userRecords.filter(
          (account) =>
            !linkedUserIds.has(
              account.id
            )
        );

      setUsers([
        ...employeeRecipients,
        ...unmatchedUserRecipients,
      ]);

      setHistory(
        historySnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .sort(
            (a, b) =>
              (b.createdAt?.seconds ||
                0) -
              (a.createdAt?.seconds ||
                0)
          )
      );
    } catch (err) {
      console.error(
        "Error loading approved schedules:",
        err
      );

      setStatusMessage(
        "Could not load approved schedules."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(
      console.error
    );
  }, []);

  const weekTags =
    useMemo(
      () =>
        Object.keys(
          groups
        ),
      [groups]
    );

  const handleOpen =
    (id) => {
      navigate(
        `/approved/${id}`
      );
    };

  const handleDistributionSent =
    async (message) => {
      setDistributionModal(
        null
      );

      setStatusMessage(
        message
      );

      await load();
    };

  if (loading) {
    return (
      <PageCard
        style={{
          padding: 22,
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading approved schedules...
        </p>
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
          position:
            "relative",
          overflow:
            "hidden",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width: 220,
            height: 220,
            borderRadius:
              "999px",
            background:
              "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position:
              "relative",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.22em",
              color:
                "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS {"\u00B7"} Scheduling
          </p>

          <h1
            style={{
              margin:
                "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing:
                "-0.04em",
            }}
          >
            Approved Schedules
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 820,
              fontSize: 14,
              color:
                "rgba(255,255,255,0.88)",
            }}
          >
            Review approved schedules by week. Station Managers can manually release schedule notifications to selected departments or employees.
          </p>
        </div>
      </div>

      {statusMessage && (
        <PageCard
          style={{
            padding: 16,
          }}
        >
          <div
            style={{
              background:
                "#edf7ff",
              border:
                "1px solid #cfe7fb",
              borderRadius: 16,
              padding:
                "14px 16px",
              color:
                "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      {!weekTags.length ? (
        <PageCard
          style={{
            padding: 22,
          }}
        >
          <p
            style={{
              margin: 0,
              color:
                "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No approved schedules yet.
          </p>
        </PageCard>
      ) : (
        weekTags.map(
          (weekTag) => {
            const list =
              groups[
                weekTag
              ];

            const sample =
              list[0];

            const weekText =
              buildWeekText(
                sample
              );

            const approvedHistory =
              history.filter(
                (item) =>
                  item.weekStart ===
                    normalizeDateString(
                      weekTag
                    ) &&
                  item.type ===
                    "approved_schedule"
              );

            const lastMinuteHistory =
              history.filter(
                (item) =>
                  item.weekStart ===
                    normalizeDateString(
                      weekTag
                    ) &&
                  item.type ===
                    "last_minute_change"
              );

            const notifiedCount =
              new Set(
                approvedHistory.flatMap(
                  (item) =>
                    Array.isArray(
                      item.sentUserIds
                    )
                      ? item.sentUserIds
                      : []
                )
              ).size;

            return (
              <PageCard
                key={
                  weekTag
                }
                style={{
                  padding: 22,
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "flex-start",
                    gap: 16,
                    flexWrap:
                      "wrap",
                    marginBottom:
                      16,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize:
                          20,
                        fontWeight:
                          800,
                        color:
                          "#0f172a",
                        letterSpacing:
                          "-0.02em",
                      }}
                    >
                      {"\u{1F4C1}"} Week: {weekText}
                    </h2>

                    <p
                      style={{
                        margin:
                          "6px 0 0",
                        fontSize:
                          13,
                        color:
                          "#64748b",
                      }}
                    >
                      {list.length} schedule
                      {list.length >
                      1
                        ? "s"
                        : ""}{" "}
                      approved for this week.
                    </p>

                    {canDistribute && (
                      <div
                        style={{
                          marginTop:
                            8,
                          display:
                            "flex",
                          gap: 7,
                          flexWrap:
                            "wrap",
                          fontSize:
                            10.5,
                          color:
                            "#64748b",
                          fontWeight:
                            700,
                        }}
                      >
                        <span>
                          Notified:{" "}
                          <b>
                            {notifiedCount}
                          </b>{" "}
                          employee(s)
                        </span>

                        <span>
                          {"\u00B7"}
                        </span>

                        <span>
                          Last minute notices:{" "}
                          <b>
                            {lastMinuteHistory.length}
                          </b>
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display:
                        "flex",
                      gap: 8,
                      flexWrap:
                        "wrap",
                      justifyContent:
                        "flex-end",
                    }}
                  >
                    {canDistribute &&
                      weekTag !==
                        "no-week" && (
                        <>
                          <ActionButton
                            variant="primary"
                            onClick={() =>
                              setDistributionModal(
                                {
                                  mode:
                                    "approved",
                                  weekTag,
                                  schedules:
                                    list,
                                }
                              )
                            }
                          >
                            {"\u{1F514}"} Notify Employees
                          </ActionButton>

                          <ActionButton
                            variant="warning"
                            onClick={() =>
                              setDistributionModal(
                                {
                                  mode:
                                    "last_minute",
                                  weekTag,
                                  schedules:
                                    list,
                                }
                              )
                            }
                          >
                            {"\u26A1"} Last Minute Change
                          </ActionButton>
                        </>
                      )}

                    <div
                      style={{
                        background:
                          "#f8fbff",
                        border:
                          "1px solid #dbeafe",
                        borderRadius:
                          14,
                        padding:
                          "10px 14px",
                        fontSize:
                          12,
                        fontWeight:
                          800,
                        color:
                          "#1769aa",
                        textTransform:
                          "uppercase",
                        letterSpacing:
                          "0.06em",
                      }}
                    >
                      {formatWeekTagLabel(
                        weekTag
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 14,
                  }}
                >
                  {list.map(
                    (sch) => (
                      <div
                        key={
                          sch.id
                        }
                        style={{
                          background:
                            "#ffffff",
                          border:
                            "1px solid #e2e8f0",
                          borderRadius:
                            20,
                          padding:
                            18,
                          boxShadow:
                            "0 10px 24px rgba(15,23,42,0.04)",
                          display:
                            "grid",
                          gap: 12,
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin:
                                0,
                              fontSize:
                                17,
                              fontWeight:
                                800,
                              color:
                                "#0f172a",
                              letterSpacing:
                                "-0.02em",
                              lineHeight:
                                1.2,
                            }}
                          >
                            {sch.airlineDisplayName ||
                              sch.airline}{" "}
                            {"\u2014"}{" "}
                            {sch.department}
                          </p>

                          <p
                            style={{
                              margin:
                                "7px 0 0",
                              fontSize:
                                12,
                              color:
                                "#64748b",
                            }}
                          >
                            Created by:{" "}
                            <b>
                              {sch.createdBy ||
                                "N/A"}
                            </b>
                          </p>

                          {sch.weekStart && (
                            <p
                              style={{
                                margin:
                                  "6px 0 0",
                                fontSize:
                                  12,
                                color:
                                  "#64748b",
                              }}
                            >
                              Week start:{" "}
                              <b>
                                {sch.weekStart}
                              </b>
                            </p>
                          )}
                        </div>

                        <div
                          style={{
                            display:
                              "grid",
                            gridTemplateColumns:
                              "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              background:
                                "#f8fbff",
                              border:
                                "1px solid #dbeafe",
                              borderRadius:
                                14,
                              padding:
                                "12px 14px",
                            }}
                          >
                            <p
                              style={{
                                margin:
                                  0,
                                fontSize:
                                  11,
                                fontWeight:
                                  800,
                                color:
                                  "#64748b",
                                textTransform:
                                  "uppercase",
                                letterSpacing:
                                  "0.08em",
                              }}
                            >
                              Total Hours
                            </p>

                            <p
                              style={{
                                margin:
                                  "6px 0 0",
                                fontSize:
                                  22,
                                fontWeight:
                                  800,
                                color:
                                  "#0f172a",
                                letterSpacing:
                                  "-0.03em",
                              }}
                            >
                              {typeof sch.airlineWeeklyHours ===
                              "number"
                                ? sch.airlineWeeklyHours.toFixed(
                                    2
                                  )
                                : "0.00"}
                            </p>
                          </div>

                          <div
                            style={{
                              background:
                                "#f8fbff",
                              border:
                                "1px solid #dbeafe",
                              borderRadius:
                                14,
                              padding:
                                "12px 14px",
                            }}
                          >
                            <p
                              style={{
                                margin:
                                  0,
                                fontSize:
                                  11,
                                fontWeight:
                                  800,
                                color:
                                  "#64748b",
                                textTransform:
                                  "uppercase",
                                letterSpacing:
                                  "0.08em",
                              }}
                            >
                              Status
                            </p>

                            <p
                              style={{
                                margin:
                                  "6px 0 0",
                                fontSize:
                                  18,
                                fontWeight:
                                  800,
                                color:
                                  "#065f46",
                                letterSpacing:
                                  "-0.02em",
                              }}
                            >
                              Approved
                            </p>
                          </div>
                        </div>

                        <div>
                          <ActionButton
                            variant="secondary"
                            onClick={() =>
                              handleOpen(
                                sch.id
                              )
                            }
                          >
                            View schedule {"\u2192"}
                          </ActionButton>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </PageCard>
            );
          }
        )
      )}

      {distributionModal && (
        <DistributionModal
          mode={
            distributionModal.mode
          }
          weekTag={
            distributionModal.weekTag
          }
          schedules={
            distributionModal.schedules
          }
          users={users}
          history={history}
          onClose={() =>
            setDistributionModal(
              null
            )
          }
          onSent={
            handleDistributionSent
          }
        />
      )}
    </div>
  );
}

// END ApprovedSchedulesPage.jsx
