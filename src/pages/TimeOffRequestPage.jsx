// src/pages/TimeOffRequestPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";
import { triggerTimeOffSubmittedPush } from "../utils/timeOffPush.js";

const MONTHLY_WARNING_THRESHOLD = 4;
const MONTHLY_MAX_REQUESTS = 5;

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
        boxShadow: "0 18px 44px rgba(15,23,42,0.14)",
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

function getMonthKey(value) {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : "";
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "this month";

  const [year, month] = monthKey.split("-");

  return new Date(
    Number(year),
    Number(month) - 1,
    1
  ).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "\u2014";

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

function getEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.username ||
    "Employee"
  );
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Employee"
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getRequestStatus(value) {
  const status = normalizeText(value || "pending");

  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "needs_info") return "needs_info";

  return "pending";
}

function getStatusLabel(value) {
  const status = getRequestStatus(value);

  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "needs_info") return "Needs Info";

  return "Pending";
}

function getStatusStyle(value) {
  const status = getRequestStatus(value);

  if (status === "approved") {
    return {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    };
  }

  if (status === "rejected") {
    return {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    };
  }

  if (status === "needs_info") {
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

function RequestStatusCard({ request, isMobile }) {
  const status = getRequestStatus(request.status);
  const statusLabel = getStatusLabel(request.status);
  const statusStyle = getStatusStyle(request.status);

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        background: "#ffffff",
        padding: isMobile ? 12 : 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.35,
            }}
          >
            {request.reasonType || "Time Off"}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            {formatDate(request.startDate)}
            {request.endDate && request.endDate !== request.startDate
              ? ` \u2192 ${formatDate(request.endDate)}`
              : ""}
          </div>
        </div>

        <span
          style={{
            ...statusStyle,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 900,
            width: "fit-content",
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
        </span>
      </div>

      {request.notes && (
        <div
          style={{
            padding: "9px 10px",
            borderRadius: 12,
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            fontSize: 12,
            color: "#475569",
            lineHeight: 1.55,
          }}
        >
          <strong>My note: </strong>
          {request.notes}
        </div>
      )}

      {request.managerNote && (
        <div
          style={{
            padding: "10px 11px",
            borderRadius: 12,
            background:
              status === "approved"
                ? "#f0fdf4"
                : status === "rejected"
                ? "#fff1f2"
                : "#fff7ed",
            border:
              status === "approved"
                ? "1px solid #bbf7d0"
                : status === "rejected"
                ? "1px solid #fecdd3"
                : "1px solid #fed7aa",
            fontSize: 12,
            color:
              status === "approved"
                ? "#166534"
                : status === "rejected"
                ? "#9f1239"
                : "#9a3412",
            lineHeight: 1.55,
          }}
        >
          <strong>Management note: </strong>
          {request.managerNote}
        </div>
      )}

      {status === "needs_info" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#9a3412",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Management needs additional information. Review the note above and
          contact your supervisor or manager.
        </div>
      )}

      {status === "approved" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#166534",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          This request has been approved and is now reflected in Management's
          time-off records.
        </div>
      )}

      {status === "rejected" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#9f1239",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          This request was not approved. Review any Management note above for
          additional information.
        </div>
      )}
    </div>
  );
}

export default function TimeOffRequestPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [employee, setEmployee] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [checkingMonthlyLimit, setCheckingMonthlyLimit] = useState(false);
  const [monthlyRequestCount, setMonthlyRequestCount] = useState(0);
  const [monthlyRequestDates, setMonthlyRequestDates] = useState([]);
  const [monthlyLimitChecked, setMonthlyLimitChecked] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ============================================================
  // RESOLVE LOGGED-IN USER -> EMPLOYEE PROFILE
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentEmployee() {
      if (!user?.id) {
        setEmployee(null);
        setEmployeeLoading(false);
        setError(
          "Your AeroStation Hub session could not be identified. Please sign in again."
        );
        return;
      }

      try {
        setEmployeeLoading(true);
        setError("");

        const linkedEmployeeId = String(user?.employeeId || "").trim();

        if (linkedEmployeeId) {
          const linkedSnap = await getDoc(
            doc(db, "employees", linkedEmployeeId)
          );

          if (!cancelled && linkedSnap.exists()) {
            setEmployee({
              id: linkedSnap.id,
              ...linkedSnap.data(),
            });
            return;
          }
        }

        const usernameCandidates = Array.from(
          new Set(
            [
              user?.username,
              user?.loginUsername,
            ]
              .map(normalizeText)
              .filter(Boolean)
          )
        );

        for (const username of usernameCandidates) {
          const employeeQuery = query(
            collection(db, "employees"),
            where("loginUsername", "==", username)
          );

          const employeeSnap = await getDocs(employeeQuery);

          if (!employeeSnap.empty) {
            const first = employeeSnap.docs[0];

            if (!cancelled) {
              setEmployee({
                id: first.id,
                ...first.data(),
              });
            }

            return;
          }
        }

        if (!cancelled) {
          setEmployee(null);
          setError(
            "Your employee profile is not linked to this AeroStation Hub account. Please contact Management."
          );
        }
      } catch (err) {
        console.error("Error resolving employee profile:", err);

        if (!cancelled) {
          setEmployee(null);
          setError(
            "Could not load your employee profile. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setEmployeeLoading(false);
        }
      }
    }

    loadCurrentEmployee();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.employeeId,
    user?.username,
    user?.loginUsername,
  ]);

  const employeeId = employee?.id || "";
  const employeeName = employee
    ? getEmployeeName(employee)
    : getVisibleUserName(user);

  // ============================================================
  // LIVE MY REQUESTS
  // ============================================================

  useEffect(() => {
    if (!employeeId) {
      setMyRequests([]);
      setRequestsLoading(false);
      return undefined;
    }

    setRequestsLoading(true);

    const qRef = query(
      collection(db, "timeOffRequests"),
      where("employeeId", "==", employeeId)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) => {
            const aSeconds =
              a.createdAt?.seconds ||
              0;

            const bSeconds =
              b.createdAt?.seconds ||
              0;

            if (aSeconds !== bSeconds) {
              return bSeconds - aSeconds;
            }

            return String(b.startDate || "").localeCompare(
              String(a.startDate || "")
            );
          });

        setMyRequests(list);
        setRequestsLoading(false);
      },
      (err) => {
        console.error("Error loading employee time off requests:", err);
        setRequestsLoading(false);
      }
    );

    return () => unsub();
  }, [employeeId]);

  const selectedMonthKey = useMemo(
    () => getMonthKey(startDate),
    [startDate]
  );

  const selectedMonthLabel = useMemo(
    () => formatMonthLabel(selectedMonthKey),
    [selectedMonthKey]
  );

  // ============================================================
  // MONTHLY LIMIT
  // ============================================================

  useEffect(() => {
    if (!employeeId || !selectedMonthKey) {
      setMonthlyRequestCount(0);
      setMonthlyRequestDates([]);
      setMonthlyLimitChecked(false);
      setCheckingMonthlyLimit(false);
      return;
    }

    setCheckingMonthlyLimit(true);
    setMonthlyLimitChecked(false);

    const monthlyRequests = myRequests.filter(
      (req) => getMonthKey(req.startDate) === selectedMonthKey
    );

    setMonthlyRequestCount(monthlyRequests.length);

    setMonthlyRequestDates(
      monthlyRequests
        .map((req) => req.startDate)
        .filter(Boolean)
        .sort()
    );

    setMonthlyLimitChecked(true);
    setCheckingMonthlyLimit(false);
  }, [
    employeeId,
    selectedMonthKey,
    myRequests,
  ]);

  const normalizeRange = () => {
    if (!startDate) return null;

    const start = startDate;
    const end = endDate || startDate;

    if (end < start) return null;

    return {
      start,
      end,
    };
  };

  const toDateSafe = (value) => {
    if (!value) return null;

    if (typeof value === "string") {
      return new Date(`${value}T00:00:00`);
    }

    if (value.toDate) {
      return value.toDate();
    }

    return new Date(value);
  };

  const normalizeMidnight = (date) => {
    if (!date) return null;

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    return d;
  };

  // ============================================================
  // MONTHLY FREQUENCY ALERT
  // ============================================================

  const sendMonthlyFrequencyAlert = async ({
    requestId,
    newCount,
    monthKey,
    previousDates,
    newRequestDate,
  }) => {
    try {
      const sourceId =
        `TIME_OFF_FREQ_${employeeId || employeeName}_${monthKey}`;

      const activeSnap = await getDocs(
        query(
          collection(db, "operational_alerts"),
          where("sourceId", "==", sourceId)
        )
      );

      if (!activeSnap.empty) return;

      const historySnap = await getDocs(
        query(
          collection(db, "operational_alert_history"),
          where("sourceId", "==", sourceId)
        )
      );

      if (!historySnap.empty) return;

      const allDates = [
        ...previousDates,
        newRequestDate,
      ]
        .filter(Boolean)
        .sort();

      await createOperationalAlert({
        alertType: "TIME_OFF_MONTHLY_FREQUENCY",
        category: "TIME_OFF",
        severity: "LOW",
        priority: "LOW",
        title: "Frequent Day Off / PTO Requests",
        message: `${employeeName} has submitted ${newCount} Day Off / PTO request(s) for ${formatMonthLabel(
          monthKey
        )}. Requested dates: ${allDates.join(
          ", "
        )}. Review monthly request frequency.`,
        source: "TimeOffRequestPage",
        sourceId,
        department: employee?.department || "",
        reportDate: newRequestDate || "",
        targetRoles: ["station_manager", "duty_manager"],
        createdByUserId: user?.id || "",
        createdByUsername:
          user?.username ||
          user?.loginUsername ||
          "",
        createdByName: employeeName,
        createdByRole: user?.role || "employee",
        metadata: {
          timeOffRequestId: requestId,
          employeeId,
          employeeName,
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          requestCount: newCount,
          requestedDates: allDates,
          warningThreshold: MONTHLY_WARNING_THRESHOLD,
          monthlyMaximum: MONTHLY_MAX_REQUESTS,
        },
      });
    } catch (alertErr) {
      console.error(
        "Monthly time off frequency alert error:",
        alertErr
      );
    }
  };

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!user?.id) {
      setError("Please sign in again before submitting a request.");
      return;
    }

    if (!employeeId || !employee) {
      setError(
        "Your employee profile is not linked to this account. Please contact Management."
      );
      return;
    }

    if (!reasonType || !startDate) {
      setError("Please complete all required fields.");
      return;
    }

    const range = normalizeRange();

    if (!range) {
      setError("Please select a valid start/end date.");
      return;
    }

    const newStartDate =
      normalizeMidnight(
        toDateSafe(range.start)
      );

    const newEndDate =
      normalizeMidnight(
        toDateSafe(range.end)
      );

    const monthKey =
      getMonthKey(
        range.start
      );

    try {
      setSubmitting(true);

      // Read the current live list again from Firestore before saving.
      // This keeps overlap and monthly-limit checks authoritative.
      const qRef = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId)
      );

      const snap =
        await getDocs(qRef);

      const existing =
        snap.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

      const monthlyRequests =
        existing.filter(
          (req) =>
            getMonthKey(
              req.startDate
            ) === monthKey
        );

      const monthlyCount =
        monthlyRequests.length;

      const monthlyDates =
        monthlyRequests
          .map(
            (req) =>
              req.startDate
          )
          .filter(Boolean)
          .sort();

      setMonthlyRequestCount(
        monthlyCount
      );

      setMonthlyRequestDates(
        monthlyDates
      );

      setMonthlyLimitChecked(
        true
      );

      if (
        monthlyCount >=
        MONTHLY_MAX_REQUESTS
      ) {
        setError(
          `You have reached the maximum of ${MONTHLY_MAX_REQUESTS} Day Off / PTO requests for ${formatMonthLabel(
            monthKey
          )}. No additional request can be submitted for this month. Please contact Management if you need assistance.`
        );

        return;
      }

      const blockingStatuses = [
        "pending",
        "approved",
      ];

      const conflicts = [];

      for (const req of existing) {
        const requestStatus =
          getRequestStatus(
            req.status
          );

        if (
          !blockingStatuses.includes(
            requestStatus
          )
        ) {
          continue;
        }

        const existingStartRaw =
          req.startDate ||
          req.date;

        const existingEndRaw =
          req.endDate ||
          req.date ||
          req.startDate;

        const existingStartDate =
          normalizeMidnight(
            toDateSafe(
              existingStartRaw
            )
          );

        const existingEndDate =
          normalizeMidnight(
            toDateSafe(
              existingEndRaw ||
              existingStartRaw
            )
          );

        if (
          !existingStartDate ||
          !existingEndDate
        ) {
          continue;
        }

        if (
          newStartDate <=
            existingEndDate &&
          existingStartDate <=
            newEndDate
        ) {
          const format =
            (d) =>
              d
                .toISOString()
                .slice(0, 10);

          conflicts.push(
            `${format(
              existingStartDate
            )} \u2192 ${format(
              existingEndDate
            )}`
          );
        }
      }

      if (
        conflicts.length > 0
      ) {
        setError(
          `There is already a pending/approved request overlapping these dates:\n${conflicts.join(
            " | "
          )}\nPlease adjust your dates or contact your manager.`
        );

        return;
      }

      const requestRef =
        await addDoc(
          collection(
            db,
            "timeOffRequests"
          ),
          {
            employeeId,
            employeeName,
            department:
              employee?.department ||
              "",
            position:
              employee?.position ||
              "",

            reasonType,
            startDate:
              range.start,
            endDate:
              range.end,
            requestMonth:
              monthKey,
            notes:
              notes.trim(),
            status:
              "pending",

            requestedByUserId:
              user?.id ||
              "",
            requestedByUsername:
              user?.username ||
              user?.loginUsername ||
              "",
            requestedByName:
              getVisibleUserName(
                user
              ),
            requestedByRole:
              user?.role ||
              "",

            createdAt:
              serverTimestamp(),
            createdVia:
              "authenticated_profile",

            managementSubmissionPushStatus:
              "PENDING",
            managementSubmissionPushError:
              "",
          }
        );

      // Fire-and-forget. The Time Off request is already safely stored.
      triggerTimeOffSubmittedPush(
        requestRef.id
      );

      const newMonthlyCount =
        monthlyCount + 1;

      const newMonthlyDates = [
        ...monthlyDates,
        range.start,
      ].sort();

      setMonthlyRequestCount(
        newMonthlyCount
      );

      setMonthlyRequestDates(
        newMonthlyDates
      );

      setMonthlyLimitChecked(
        true
      );

      if (
        newMonthlyCount >=
        MONTHLY_WARNING_THRESHOLD
      ) {
        await sendMonthlyFrequencyAlert({
          requestId:
            requestRef.id,
          newCount:
            newMonthlyCount,
          monthKey,
          previousDates:
            monthlyDates,
          newRequestDate:
            range.start,
        });
      }

      if (
        newMonthlyCount >=
        MONTHLY_MAX_REQUESTS
      ) {
        setMessage(
          `Your request was submitted successfully. You have now reached the monthly maximum of ${MONTHLY_MAX_REQUESTS} requests for ${formatMonthLabel(
            monthKey
          )}.`
        );
      } else if (
        newMonthlyCount >=
        MONTHLY_WARNING_THRESHOLD
      ) {
        const remaining =
          MONTHLY_MAX_REQUESTS -
          newMonthlyCount;

        setMessage(
          `Your request was submitted successfully. You now have ${newMonthlyCount} requests for ${formatMonthLabel(
            monthKey
          )}. ${remaining} request${
            remaining === 1
              ? ""
              : "s"
          } remaining this month.`
        );
      } else {
        setMessage(
          "Your request has been submitted successfully. You can track the status below."
        );
      }

      setReasonType("");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (err) {
      console.error(
        "Error submitting time off request:",
        err
      );

      setError(
        "There was an error submitting your request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr =
    new Date()
      .toISOString()
      .slice(0, 10);

  const monthlyLimitReached =
    Boolean(
      employeeId &&
      startDate
    ) &&
    monthlyLimitChecked &&
    monthlyRequestCount >=
      MONTHLY_MAX_REQUESTS;

  const monthlyWarning =
    Boolean(
      employeeId &&
      startDate
    ) &&
    monthlyLimitChecked &&
    monthlyRequestCount >=
      MONTHLY_WARNING_THRESHOLD &&
    monthlyRequestCount <
      MONTHLY_MAX_REQUESTS;

  const remainingRequests =
    Math.max(
      0,
      MONTHLY_MAX_REQUESTS -
        monthlyRequestCount
    );

  const statusCounts =
    useMemo(() => {
      const result = {
        pending: 0,
        approved: 0,
        rejected: 0,
        needsInfo: 0,
      };

      myRequests.forEach(
        (request) => {
          const status =
            getRequestStatus(
              request.status
            );

          if (
            status ===
            "approved"
          ) {
            result.approved += 1;
          } else if (
            status ===
            "rejected"
          ) {
            result.rejected += 1;
          } else if (
            status ===
            "needs_info"
          ) {
            result.needsInfo += 1;
          } else {
            result.pending += 1;
          }
        }
      );

      return result;
    }, [myRequests]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(15,92,145,0.92) 0%, rgba(31,124,193,0.86) 42%, rgba(110,198,232,0.82) 100%), url('/flamingo-tpa.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding:
          isMobile
            ? "18px 12px 28px"
            : "24px 16px",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth:
            isTablet
              ? 760
              : 860,
          display: "grid",
          gap:
            isMobile
              ? 12
              : 16,
          minWidth: 0,
        }}
      >
        <div
          style={{
            color: "#fff",
            textAlign: "center",
            padding:
              isMobile
                ? "4px 8px 0"
                : "0 8px",
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width:
                isMobile
                  ? 42
                  : 50,
              height:
                isMobile
                  ? 42
                  : 50,
              borderRadius: 12,
              background: "#fff",
              objectFit: "contain",
              boxShadow:
                "0 10px 25px rgba(15,23,42,0.16)",
              marginBottom:
                isMobile
                  ? 7
                  : 9,
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize:
                isMobile
                  ? 9
                  : 10,
              textTransform:
                "uppercase",
              letterSpacing:
                isMobile
                  ? "0.12em"
                  : "0.16em",
              color:
                "rgba(255,255,255,0.82)",
              fontWeight: 800,
            }}
          >
            {APP_NAME} {"\u00B7"} My Time Off
          </p>

          <h1
            style={{
              margin:
                isMobile
                  ? "6px 0 5px"
                  : "8px 0 6px",
              fontSize:
                isMobile
                  ? 23
                  : 29,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing:
                "-0.035em",
            }}
          >
            Request & Track Time Off
          </h1>

          <p
            style={{
              margin: 0,
              fontSize:
                isMobile
                  ? 11.5
                  : 13,
              lineHeight: 1.5,
              color:
                "rgba(255,255,255,0.90)",
              maxWidth: 650,
              marginInline: "auto",
            }}
          >
            Submit PTO, Sick, Personal or other time off requests and track
            Management decisions from the same page.
          </p>

          <p
            style={{
              margin:
                "4px 0 0",
              fontSize:
                isMobile
                  ? 9.5
                  : 10.5,
              color:
                "rgba(255,255,255,0.72)",
              fontWeight: 700,
            }}
          >
            {APP_SUBTITLE}
          </p>
        </div>

        <PageCard
          style={{
            padding:
              isMobile
                ? 14
                : 18,
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
                  : "center",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#1769aa",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.08em",
                }}
              >
                Signed In Employee
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize:
                    isMobile
                      ? 17
                      : 19,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {employeeLoading
                  ? "Loading profile..."
                  : employeeName}
              </div>

              {!employeeLoading &&
                employee && (
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {[
                      employee.position,
                      employee.department,
                    ]
                      .filter(Boolean)
                      .join(
                        " \u00B7 "
                      ) ||
                      "AeroStation Hub employee profile"}
                  </div>
                )}
            </div>

            {!employeeLoading &&
              employee && (
                <div
                  style={{
                    background:
                      "#ecfdf5",
                    border:
                      "1px solid #a7f3d0",
                    borderRadius: 999,
                    padding:
                      "7px 11px",
                    color:
                      "#065f46",
                    fontSize: 11,
                    fontWeight: 900,
                    width:
                      "fit-content",
                  }}
                >
                  Account Verified
                </div>
              )}
          </div>
        </PageCard>

        <PageCard
          style={{
            padding:
              isMobile
                ? 16
                : 22,
          }}
        >
          <div
            style={{
              marginBottom:
                isMobile
                  ? 12
                  : 14,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize:
                  isMobile
                    ? 17
                    : 19,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing:
                  "-0.02em",
              }}
            >
              New Request
            </h2>

            <p
              style={{
                margin:
                  "4px 0 0",
                fontSize:
                  isMobile
                    ? 11.5
                    : 12.5,
                color:
                  "#64748b",
              }}
            >
              Maximum {MONTHLY_MAX_REQUESTS} Day Off / PTO requests per employee
              per month. No PIN is required because this request is linked to
              your signed-in AeroStation Hub account.
            </p>
          </div>

          <form
            onSubmit={
              handleSubmit
            }
            style={{
              display: "grid",
              gap:
                isMobile
                  ? 11
                  : 13,
            }}
          >
            <div>
              <FieldLabel>
                Reason Type
              </FieldLabel>

              <SelectInput
                value={
                  reasonType
                }
                disabled={
                  submitting ||
                  employeeLoading ||
                  !employee
                }
                onChange={(e) =>
                  setReasonType(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Select reason
                </option>

                <option value="PTO">
                  PTO
                </option>

                <option value="Sick">
                  Sick
                </option>

                <option value="Personal">
                  Personal
                </option>

                <option value="Other">
                  Other
                </option>
              </SelectInput>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  isMobile
                    ? "1fr"
                    : "repeat(2, minmax(0, 1fr))",
                gap:
                  isMobile
                    ? 10
                    : 13,
              }}
            >
              <div>
                <FieldLabel>
                  Start Date
                </FieldLabel>

                <TextInput
                  type="date"
                  value={
                    startDate
                  }
                  disabled={
                    submitting ||
                    employeeLoading ||
                    !employee
                  }
                  onChange={(e) => {
                    setStartDate(
                      e.target.value
                    );

                    setError("");
                    setMessage("");

                    if (
                      !endDate ||
                      e.target.value >
                        endDate
                    ) {
                      setEndDate(
                        e.target.value
                      );
                    }
                  }}
                  min={
                    todayStr
                  }
                />
              </div>

              <div>
                <FieldLabel>
                  End Date
                </FieldLabel>

                <TextInput
                  type="date"
                  value={
                    endDate
                  }
                  disabled={
                    submitting ||
                    employeeLoading ||
                    !employee
                  }
                  onChange={(e) =>
                    setEndDate(
                      e.target.value
                    )
                  }
                  min={
                    startDate ||
                    todayStr
                  }
                />
              </div>
            </div>

            {employeeId &&
              startDate && (
                <div
                  style={{
                    borderRadius: 14,
                    padding:
                      "11px 12px",
                    background:
                      checkingMonthlyLimit
                        ? "#f8fafc"
                        : monthlyLimitReached
                        ? "#fff1f2"
                        : monthlyWarning
                        ? "#fff7ed"
                        : "#f0fdf4",
                    border:
                      checkingMonthlyLimit
                        ? "1px solid #e2e8f0"
                        : monthlyLimitReached
                        ? "1px solid #fecdd3"
                        : monthlyWarning
                        ? "1px solid #fed7aa"
                        : "1px solid #bbf7d0",
                    color:
                      checkingMonthlyLimit
                        ? "#475569"
                        : monthlyLimitReached
                        ? "#9f1239"
                        : monthlyWarning
                        ? "#9a3412"
                        : "#166534",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 900,
                      lineHeight: 1.5,
                    }}
                  >
                    {checkingMonthlyLimit
                      ? "Checking monthly request history..."
                      : monthlyLimitReached
                      ? `Monthly maximum reached: ${monthlyRequestCount} of ${MONTHLY_MAX_REQUESTS} requests for ${selectedMonthLabel}.`
                      : monthlyWarning
                      ? `Monthly request warning: ${monthlyRequestCount} of ${MONTHLY_MAX_REQUESTS} requests already submitted for ${selectedMonthLabel}.`
                      : `${monthlyRequestCount} of ${MONTHLY_MAX_REQUESTS} requests used for ${selectedMonthLabel}.`}
                  </div>

                  {!checkingMonthlyLimit &&
                    monthlyRequestDates.length >
                      0 && (
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 11.5,
                          lineHeight: 1.5,
                        }}
                      >
                        Previous requested dates:{" "}
                        {monthlyRequestDates.join(
                          ", "
                        )}
                      </div>
                    )}

                  {!checkingMonthlyLimit &&
                    !monthlyLimitReached && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          fontWeight: 800,
                        }}
                      >
                        {remainingRequests} request
                        {remainingRequests ===
                        1
                          ? ""
                          : "s"}{" "}
                        remaining before the monthly limit is reached.
                      </div>
                    )}

                  {monthlyLimitReached && (
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 11.5,
                        fontWeight: 800,
                        lineHeight: 1.5,
                      }}
                    >
                      You have reached the maximum of {MONTHLY_MAX_REQUESTS}{" "}
                      requests for this month. Please contact Management if
                      assistance is needed.
                    </div>
                  )}
                </div>
              )}

            <div>
              <FieldLabel>
                Notes (optional)
              </FieldLabel>

              <TextArea
                rows={4}
                disabled={
                  submitting ||
                  monthlyLimitReached ||
                  employeeLoading ||
                  !employee
                }
                placeholder="Additional details (appointment, family matter, etc.)"
                value={
                  notes
                }
                onChange={(e) =>
                  setNotes(
                    e.target.value
                  )
                }
              />
            </div>

            <div
              style={{
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                borderRadius: 14,
                padding:
                  "11px 12px",
                fontSize: 11.5,
                color: "#334155",
                lineHeight: 1.6,
              }}
            >
              Management may take up to <b>72 hours</b> to approve, reject, or
              request additional information. You will receive a notification
              when the request is updated.
            </div>

            {error && (
              <div
                style={{
                  whiteSpace:
                    "pre-line",
                  background:
                    "#fff1f2",
                  border:
                    "1px solid #fecdd3",
                  borderRadius: 14,
                  padding:
                    "11px 12px",
                  color:
                    "#9f1239",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textAlign:
                    "center",
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  background:
                    "#ecfdf5",
                  border:
                    "1px solid #a7f3d0",
                  borderRadius: 14,
                  padding:
                    "11px 12px",
                  color:
                    "#065f46",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textAlign:
                    "center",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                employeeLoading ||
                !employee ||
                requestsLoading ||
                checkingMonthlyLimit ||
                monthlyLimitReached
              }
              style={{
                marginTop: 2,
                width: "100%",
                background:
                  submitting ||
                  employeeLoading ||
                  !employee ||
                  requestsLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                borderRadius: 12,
                border: "none",
                padding:
                  "12px 15px",
                color:
                  "#ffffff",
                fontSize: 13.5,
                fontWeight: 800,
                cursor:
                  submitting ||
                  employeeLoading ||
                  !employee ||
                  requestsLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "not-allowed"
                    : "pointer",
                boxShadow:
                  submitting ||
                  employeeLoading ||
                  !employee ||
                  requestsLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "none"
                    : "0 10px 22px rgba(23,105,170,0.24)",
              }}
            >
              {submitting
                ? "Submitting..."
                : employeeLoading
                ? "Loading Employee Profile..."
                : !employee
                ? "Employee Profile Not Linked"
                : requestsLoading
                ? "Loading My Requests..."
                : checkingMonthlyLimit
                ? "Checking Monthly Limit..."
                : monthlyLimitReached
                ? `Maximum ${MONTHLY_MAX_REQUESTS} Requests Reached`
                : "Submit Request"}
            </button>
          </form>
        </PageCard>

        <PageCard
          style={{
            padding:
              isMobile
                ? 14
                : 18,
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
              gap: 12,
              alignItems:
                isMobile
                  ? "stretch"
                  : "center",
              marginBottom: 14,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize:
                    isMobile
                      ? 18
                      : 20,
                  fontWeight: 900,
                  color:
                    "#0f172a",
                  letterSpacing:
                    "-0.02em",
                }}
              >
                My Time Off Requests
              </h2>

              <p
                style={{
                  margin:
                    "4px 0 0",
                  fontSize: 12,
                  color:
                    "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Your requests update automatically when Management takes action.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <StatusSummary
                label="Pending"
                value={
                  statusCounts.pending
                }
                tone="blue"
              />

              <StatusSummary
                label="Approved"
                value={
                  statusCounts.approved
                }
                tone="green"
              />

              <StatusSummary
                label="Needs Info"
                value={
                  statusCounts.needsInfo
                }
                tone="orange"
              />

              <StatusSummary
                label="Rejected"
                value={
                  statusCounts.rejected
                }
                tone="red"
              />
            </div>
          </div>

          {requestsLoading ? (
            <div
              style={{
                padding: 18,
                textAlign: "center",
                color:
                  "#64748b",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              Loading your requests...
            </div>
          ) : myRequests.length ===
            0 ? (
            <div
              style={{
                padding: 18,
                textAlign: "center",
                color:
                  "#64748b",
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                borderRadius: 14,
                fontSize: 12.5,
                lineHeight: 1.6,
              }}
            >
              You do not have any Time Off requests yet. New requests will
              appear here automatically.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 9,
              }}
            >
              {myRequests.map(
                (request) => (
                  <RequestStatusCard
                    key={
                      request.id
                    }
                    request={
                      request
                    }
                    isMobile={
                      isMobile
                    }
                  />
                )
              )}
            </div>
          )}
        </PageCard>
      </div>
    </div>
  );
}

function StatusSummary({
  label,
  value,
  tone,
}) {
  const tones = {
    blue: {
      background:
        "#eff6ff",
      border:
        "1px solid #bfdbfe",
      color:
        "#1769aa",
    },
    green: {
      background:
        "#ecfdf5",
      border:
        "1px solid #a7f3d0",
      color:
        "#065f46",
    },
    orange: {
      background:
        "#fff7ed",
      border:
        "1px solid #fed7aa",
      color:
        "#9a3412",
    },
    red: {
      background:
        "#fff1f2",
      border:
        "1px solid #fecdd3",
      color:
        "#9f1239",
    },
  };

  const style =
    tones[tone] ||
    tones.blue;

  return (
    <div
      style={{
        ...style,
        borderRadius: 11,
        padding:
          "7px 9px",
        minWidth: 62,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.04em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 2,
          fontSize: 16,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// END TimeOffRequestPage
