// src/pages/TimeOffRequestPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";

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
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
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

export default function TimeOffRequestPage() {
  const { isMobile, isTablet } = useViewport();

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [checkingMonthlyLimit, setCheckingMonthlyLimit] = useState(false);
  const [monthlyRequestCount, setMonthlyRequestCount] = useState(0);
  const [monthlyRequestDates, setMonthlyRequestDates] = useState([]);
  const [monthlyLimitChecked, setMonthlyLimitChecked] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      try {
        setEmployeesLoading(true);
        const snap = await getDocs(collection(db, "employees"));

        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((employee) => String(getEmployeeName(employee)).trim())
          .sort((a, b) =>
            getEmployeeName(a).localeCompare(getEmployeeName(b))
          );

        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for time off form:", err);
        setError("Could not load the employee list. Please try again.");
      } finally {
        setEmployeesLoading(false);
      }
    }

    loadEmployees().catch(console.error);
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) || null,
    [employees, employeeId]
  );

  const selectedMonthKey = useMemo(() => getMonthKey(startDate), [startDate]);

  const selectedMonthLabel = useMemo(
    () => formatMonthLabel(selectedMonthKey),
    [selectedMonthKey]
  );

  useEffect(() => {
    let cancelled = false;

    async function checkMonthlyFrequency() {
      if (!employeeId || !selectedMonthKey) {
        setMonthlyRequestCount(0);
        setMonthlyRequestDates([]);
        setMonthlyLimitChecked(false);
        return;
      }

      try {
        setCheckingMonthlyLimit(true);
        setMonthlyLimitChecked(false);

        const qRef = query(
          collection(db, "timeOffRequests"),
          where("employeeId", "==", employeeId)
        );

        const snap = await getDocs(qRef);
        if (cancelled) return;

        const monthlyRequests = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((req) => getMonthKey(req.startDate) === selectedMonthKey);

        setMonthlyRequestCount(monthlyRequests.length);
        setMonthlyRequestDates(
          monthlyRequests
            .map((req) => req.startDate)
            .filter(Boolean)
            .sort()
        );
        setMonthlyLimitChecked(true);
      } catch (err) {
        console.error("Error checking monthly request frequency:", err);
        if (!cancelled) {
          setMonthlyRequestCount(0);
          setMonthlyRequestDates([]);
          setMonthlyLimitChecked(false);
        }
      } finally {
        if (!cancelled) setCheckingMonthlyLimit(false);
      }
    }

    checkMonthlyFrequency();

    return () => {
      cancelled = true;
    };
  }, [employeeId, selectedMonthKey]);

  const normalizeRange = () => {
    if (!startDate) return null;
    const start = startDate;
    const end = endDate || startDate;
    if (end < start) return null;
    return { start, end };
  };

  const toDateSafe = (value) => {
    if (!value) return null;
    if (typeof value === "string") return new Date(`${value}T00:00:00`);
    if (value.toDate) return value.toDate();
    return new Date(value);
  };

  const normalizeMidnight = (date) => {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const sendMonthlyFrequencyAlert = async ({
    employee,
    employeeName,
    requestId,
    newCount,
    monthKey,
    previousDates,
    newRequestDate,
  }) => {
    try {
      const sourceId = `TIME_OFF_FREQ_${employee?.id || employeeName}_${monthKey}`;

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

      const allDates = [...previousDates, newRequestDate]
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
        createdByUserId: "",
        createdByUsername: "",
        createdByName: employeeName,
        createdByRole: "employee",
        metadata: {
          timeOffRequestId: requestId,
          employeeId: employee?.id || "",
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
      console.error("Monthly time off frequency alert error:", alertErr);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!employeeId || !reasonType || !startDate) {
      setError("Please complete all required fields.");
      return;
    }

    const range = normalizeRange();
    if (!range) {
      setError("Please select a valid start/end date.");
      return;
    }

    if (pin.length !== 4) {
      setError("PIN must be 4 digits.");
      return;
    }

    const employee = employees.find((item) => item.id === employeeId);
    const employeeName = getEmployeeName(employee);

    const newStartDate = normalizeMidnight(toDateSafe(range.start));
    const newEndDate = normalizeMidnight(toDateSafe(range.end));
    const monthKey = getMonthKey(range.start);

    try {
      setSubmitting(true);

      const qRef = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId)
      );

      const snap = await getDocs(qRef);
      const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const monthlyRequests = existing.filter(
        (req) => getMonthKey(req.startDate) === monthKey
      );

      const monthlyCount = monthlyRequests.length;
      const monthlyDates = monthlyRequests
        .map((req) => req.startDate)
        .filter(Boolean)
        .sort();

      setMonthlyRequestCount(monthlyCount);
      setMonthlyRequestDates(monthlyDates);
      setMonthlyLimitChecked(true);

      if (monthlyCount >= MONTHLY_MAX_REQUESTS) {
        setError(
          `You have reached the maximum of ${MONTHLY_MAX_REQUESTS} Day Off / PTO requests for ${formatMonthLabel(
            monthKey
          )}. No additional request can be submitted for this month. Please contact Management if you need assistance.`
        );
        return;
      }

      const blockingStatuses = ["pending", "approved"];
      const conflicts = [];

      for (const req of existing) {
        if (!blockingStatuses.includes(req.status || "pending")) continue;

        const existingStartRaw = req.startDate || req.date;
        const existingEndRaw = req.endDate || req.date || req.startDate;

        const existingStartDate = normalizeMidnight(
          toDateSafe(existingStartRaw)
        );
        const existingEndDate = normalizeMidnight(
          toDateSafe(existingEndRaw || existingStartRaw)
        );

        if (!existingStartDate || !existingEndDate) continue;

        if (
          newStartDate <= existingEndDate &&
          existingStartDate <= newEndDate
        ) {
          const format = (d) => d.toISOString().slice(0, 10);
          conflicts.push(
            `${format(existingStartDate)} \u2192 ${format(existingEndDate)}`
          );
        }
      }

      if (conflicts.length > 0) {
        setError(
          `There is already a pending/approved request overlapping these dates:\n${conflicts.join(
            " | "
          )}\nPlease adjust your dates or contact your manager.`
        );
        return;
      }

      const requestRef = await addDoc(collection(db, "timeOffRequests"), {
        employeeId,
        employeeName,
        reasonType,
        startDate: range.start,
        endDate: range.end,
        requestMonth: monthKey,
        pin,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        createdVia: "public_form",
      });

      const newMonthlyCount = monthlyCount + 1;
      const newMonthlyDates = [...monthlyDates, range.start].sort();

      setMonthlyRequestCount(newMonthlyCount);
      setMonthlyRequestDates(newMonthlyDates);
      setMonthlyLimitChecked(true);

      if (newMonthlyCount >= MONTHLY_WARNING_THRESHOLD) {
        await sendMonthlyFrequencyAlert({
          employee: { ...employee, id: employeeId },
          employeeName,
          requestId: requestRef.id,
          newCount: newMonthlyCount,
          monthKey,
          previousDates: monthlyDates,
          newRequestDate: range.start,
        });
      }

      if (newMonthlyCount >= MONTHLY_MAX_REQUESTS) {
        setMessage(
          `Your request was submitted successfully. You have now reached the monthly maximum of ${MONTHLY_MAX_REQUESTS} requests for ${formatMonthLabel(
            monthKey
          )}. No additional requests can be submitted for this month.`
        );
      } else if (newMonthlyCount >= MONTHLY_WARNING_THRESHOLD) {
        const remaining = MONTHLY_MAX_REQUESTS - newMonthlyCount;

        setMessage(
          `Your request was submitted successfully. You now have ${newMonthlyCount} requests for ${formatMonthLabel(
            monthKey
          )}. ${remaining} request${remaining === 1 ? "" : "s"} remaining this month.`
        );
      } else {
        setMessage("Your request has been submitted successfully.");
      }

      setReasonType("");
      setStartDate("");
      setEndDate("");
      setPin("");
      setNotes("");
    } catch (err) {
      console.error("Error submitting time off request:", err);
      setError("There was an error submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const monthlyLimitReached =
    Boolean(employeeId && startDate) &&
    monthlyLimitChecked &&
    monthlyRequestCount >= MONTHLY_MAX_REQUESTS;

  const monthlyWarning =
    Boolean(employeeId && startDate) &&
    monthlyLimitChecked &&
    monthlyRequestCount >= MONTHLY_WARNING_THRESHOLD &&
    monthlyRequestCount < MONTHLY_MAX_REQUESTS;

  const remainingRequests = Math.max(
    0,
    MONTHLY_MAX_REQUESTS - monthlyRequestCount
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(15,92,145,0.92) 0%, rgba(31,124,193,0.86) 42%, rgba(110,198,232,0.82) 100%), url('/flamingo-tpa.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        padding: isMobile ? "18px 12px 28px" : "24px 16px",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isTablet ? 720 : 760,
          display: "grid",
          gap: isMobile ? 12 : 16,
          minWidth: 0,
        }}
      >
        <div
          style={{
            color: "#fff",
            textAlign: "center",
            padding: isMobile ? "4px 8px 0" : "0 8px",
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width: isMobile ? 42 : 50,
              height: isMobile ? 42 : 50,
              borderRadius: 12,
              background: "#fff",
              objectFit: "contain",
              boxShadow: "0 10px 25px rgba(15,23,42,0.16)",
              marginBottom: isMobile ? 7 : 9,
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 9 : 10,
              textTransform: "uppercase",
              letterSpacing: isMobile ? "0.12em" : "0.16em",
              color: "rgba(255,255,255,0.82)",
              fontWeight: 800,
            }}
          >
            {APP_NAME} {"\u00B7"} Time Off
          </p>

          <h1
            style={{
              margin: isMobile ? "6px 0 5px" : "8px 0 6px",
              fontSize: isMobile ? 23 : 29,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: "-0.035em",
            }}
          >
            Day Off Request
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 11.5 : 13,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.90)",
              maxWidth: 620,
              marginInline: "auto",
            }}
          >
            Submit PTO, Sick, Personal or other time off requests for review by
            Management.
          </p>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: isMobile ? 9.5 : 10.5,
              color: "rgba(255,255,255,0.72)",
              fontWeight: 700,
            }}
          >
            {APP_SUBTITLE}
          </p>
        </div>

        <PageCard style={{ padding: isMobile ? 16 : 22 }}>
          <div style={{ marginBottom: isMobile ? 12 : 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 19,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Request Details
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 11.5 : 12.5,
                color: "#64748b",
              }}
            >
              Maximum {MONTHLY_MAX_REQUESTS} Day Off / PTO requests per employee
              per month.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gap: isMobile ? 11 : 13 }}
          >
            <div>
              <FieldLabel>Employee Name</FieldLabel>

              <SelectInput
                value={employeeId}
                disabled={employeesLoading || submitting}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setError("");
                  setMessage("");
                }}
              >
                <option value="">
                  {employeesLoading
                    ? "Loading employees..."
                    : "Select your name"}
                </option>

                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {getEmployeeName(emp)}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Reason Type</FieldLabel>

              <SelectInput
                value={reasonType}
                disabled={submitting}
                onChange={(e) => setReasonType(e.target.value)}
              >
                <option value="">Select reason</option>
                <option value="PTO">PTO</option>
                <option value="Sick">Sick</option>
                <option value="Personal">Personal</option>
                <option value="Other">Other</option>
              </SelectInput>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
                gap: isMobile ? 10 : 13,
              }}
            >
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <TextInput
                  type="date"
                  value={startDate}
                  disabled={submitting}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setError("");
                    setMessage("");

                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  min={todayStr}
                />
              </div>

              <div>
                <FieldLabel>End Date</FieldLabel>
                <TextInput
                  type="date"
                  value={endDate}
                  disabled={submitting}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || todayStr}
                />
              </div>
            </div>

            {employeeId && startDate && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "11px 12px",
                  background: checkingMonthlyLimit
                    ? "#f8fafc"
                    : monthlyLimitReached
                    ? "#fff1f2"
                    : monthlyWarning
                    ? "#fff7ed"
                    : "#f0fdf4",
                  border: checkingMonthlyLimit
                    ? "1px solid #e2e8f0"
                    : monthlyLimitReached
                    ? "1px solid #fecdd3"
                    : monthlyWarning
                    ? "1px solid #fed7aa"
                    : "1px solid #bbf7d0",
                  color: checkingMonthlyLimit
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

                {!checkingMonthlyLimit && monthlyRequestDates.length > 0 && (
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 11.5,
                      lineHeight: 1.5,
                    }}
                  >
                    Previous requested dates: {monthlyRequestDates.join(", ")}
                  </div>
                )}

                {!checkingMonthlyLimit && !monthlyLimitReached && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {remainingRequests} request
                    {remainingRequests === 1 ? "" : "s"} remaining before the
                    monthly limit is reached.
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
                    You have reached the maximum of 5 requests for this month.
                    No additional Day Off / PTO request can be submitted.
                    Please contact Management if assistance is needed.
                  </div>
                )}
              </div>
            )}

            <div>
              <FieldLabel>4-digit PIN</FieldLabel>

              <TextInput
                type="password"
                maxLength={4}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={submitting || monthlyLimitReached}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                style={{
                  letterSpacing: "0.22em",
                  fontSize: 16,
                  textAlign: "center",
                }}
                placeholder="Enter 4-digit PIN"
              />

              <p
                style={{
                  marginTop: 7,
                  marginBottom: 0,
                  fontSize: 11.5,
                  color: "#64748b",
                  lineHeight: 1.55,
                }}
              >
                This PIN is used to check the status of your request later.
              </p>
            </div>

            <div>
              <FieldLabel>Notes (optional)</FieldLabel>

              <TextArea
                rows={4}
                disabled={submitting || monthlyLimitReached}
                placeholder="Additional details (flight, doctor appointment, etc.)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "11px 12px",
                fontSize: 11.5,
                color: "#334155",
                lineHeight: 1.6,
              }}
            >
              Management may take up to <b>72 hours</b> to approve, reject, or
              request additional information.
            </div>

            {error && (
              <div
                style={{
                  whiteSpace: "pre-line",
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: 14,
                  padding: "11px 12px",
                  color: "#9f1239",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: 14,
                  padding: "11px 12px",
                  color: "#065f46",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                employeesLoading ||
                checkingMonthlyLimit ||
                monthlyLimitReached
              }
              style={{
                marginTop: 2,
                width: "100%",
                background:
                  submitting ||
                  employeesLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                borderRadius: 12,
                border: "none",
                padding: "12px 15px",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 800,
                cursor:
                  submitting ||
                  employeesLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "not-allowed"
                    : "pointer",
                boxShadow:
                  submitting ||
                  employeesLoading ||
                  checkingMonthlyLimit ||
                  monthlyLimitReached
                    ? "none"
                    : "0 10px 22px rgba(23,105,170,0.24)",
              }}
            >
              {submitting
                ? "Submitting..."
                : checkingMonthlyLimit
                ? "Checking Monthly Limit..."
                : monthlyLimitReached
                ? "Maximum 5 Requests Reached"
                : "Submit Request"}
            </button>
          </form>
        </PageCard>
      </div>
    </div>
  );
}
