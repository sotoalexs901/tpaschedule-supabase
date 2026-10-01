// src/pages/PassengerFeedbackManagementPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

const ACCOUNTS = [
  {
    key: "wchr",
    label: "WCHR",
    description: "Wheelchair Assistance",
  },
  {
    key: "sun-country",
    label: "Sun Country",
    description: "Passenger Service",
  },
  {
    key: "world-atlantic",
    label: "World Atlantic",
    description: "Passenger Service",
  },
];

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthStartString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatDate(value) {
  const clean = normalizeText(value);
  if (!clean) return "—";

  const [year, month, day] = clean.split("-").map(Number);
  if (!year || !month || !day) return clean;

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function languageLabel(value) {
  if (value === "es") return "Español";
  if (value === "pt") return "Português";
  return "English";
}

function responseLabel(value) {
  const map = {
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    yes: "Yes",
    partially: "Partially",
    no: "No",
  };

  return map[value] || value || "—";
}

function StatCard({ label, value, helper }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 18,
        padding: 16,
        minWidth: 0,
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#94a3b8",
          fontWeight: 900,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 27,
          fontWeight: 900,
          color: "#0f172a",
          letterSpacing: "-0.04em",
        }}
      >
        {value}
      </div>

      {helper && (
        <div
          style={{
            marginTop: 4,
            color: "#64748b",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {helper}
        </div>
      )}
    </div>
  );
}

function QrCard({ account }) {
  const [copied, setCopied] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/feedback/${account.key}`
      : `/feedback/${account.key}`;

  const qrImageUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&margin=12&data=${encodeURIComponent(publicUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this feedback link:", publicUrl);
    }
  };

  const printQr = () => {
    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${account.label} Passenger Feedback QR</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 38px 28px;
              text-align: center;
              color: #0f172a;
            }
            .brand { font-size: 13px; font-weight: 800; letter-spacing: .08em; color: #1769aa; text-transform: uppercase; }
            h1 { margin: 12px 0 4px; font-size: 30px; }
            p { color: #475569; line-height: 1.5; }
            img { width: 300px; height: 300px; margin: 22px auto; display:block; }
            .url { font-size: 12px; color:#64748b; word-break:break-all; }
          </style>
        </head>
        <body>
          <div class="brand">AeroStation Hub · Passenger Feedback</div>
          <h1>${account.label}</h1>
          <p>Scan the QR code and tell us about your experience.<br/>English · Español · Português</p>
          <img src="${qrImageUrl}" alt="${account.label} feedback QR" />
          <div class="url">${publicUrl}</div>
        </body>
      </html>
    `);

    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 600);
  };

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 22,
        padding: 16,
        display: "grid",
        gap: 13,
        boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 18,
            color: "#0f172a",
            fontWeight: 900,
          }}
        >
          {account.label}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          {account.description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          background: "#f8fbff",
          border: "1px solid #e2e8f0",
          borderRadius: 18,
          padding: 12,
        }}
      >
        <img
          src={qrImageUrl}
          alt={`${account.label} Passenger Feedback QR`}
          style={{
            width: "100%",
            maxWidth: 240,
            aspectRatio: "1 / 1",
            objectFit: "contain",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 10.5,
          color: "#64748b",
          wordBreak: "break-all",
          lineHeight: 1.45,
        }}
      >
        {publicUrl}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={copyLink}
          style={secondaryButton}
        >
          {copied ? "Copied" : "Copy Link"}
        </button>

        <button
          type="button"
          onClick={printQr}
          style={primaryButton}
        >
          Print QR
        </button>
      </div>
    </div>
  );
}

export default function PassengerFeedbackManagementPage() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [accountFilter, setAccountFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState(monthStartString());
  const [toDate, setToDate] = useState(todayString());
  const [needsFollowUpOnly, setNeedsFollowUpOnly] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "passenger_feedback"),
      (snap) => {
        setFeedback(
          snap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoadError("");
        setLoading(false);
      },
      (error) => {
        console.error("Passenger feedback management listener failed:", error);
        setLoadError(
          "Could not load passenger feedback. Please verify Firestore access for management users."
        );
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const employeeOptions = useMemo(() => {
    const map = new Map();

    feedback.forEach((item) => {
      if (item.employeeId && item.employeeName) {
        map.set(item.employeeId, item.employeeName);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
  }, [feedback]);

  const filtered = useMemo(() => {
    return feedback
      .filter((item) => {
        if (
          accountFilter !== "ALL" &&
          item.account !== accountFilter
        ) {
          return false;
        }

        if (
          employeeFilter !== "ALL" &&
          item.employeeId !== employeeFilter
        ) {
          return false;
        }

        const serviceDate = normalizeText(item.serviceDate);

        if (fromDate && serviceDate && serviceDate < fromDate) {
          return false;
        }

        if (toDate && serviceDate && serviceDate > toDate) {
          return false;
        }

        if (needsFollowUpOnly && Number(item.rating || 0) > 2) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateCompare = normalizeText(b.serviceDate).localeCompare(
          normalizeText(a.serviceDate)
        );

        if (dateCompare !== 0) return dateCompare;

        const aMillis = a.submittedAt?.toMillis?.() || 0;
        const bMillis = b.submittedAt?.toMillis?.() || 0;

        return bMillis - aMillis;
      });
  }, [
    feedback,
    accountFilter,
    employeeFilter,
    fromDate,
    toDate,
    needsFollowUpOnly,
  ]);

  const total = filtered.length;

  const averageRating =
    total > 0
      ? (
          filtered.reduce(
            (sum, item) => sum + Number(item.rating || 0),
            0
          ) / total
        ).toFixed(2)
      : "0.00";

  const fiveStarCount = filtered.filter(
    (item) => Number(item.rating || 0) === 5
  ).length;

  const fiveStarPct =
    total > 0
      ? `${Math.round((fiveStarCount / total) * 100)}%`
      : "0%";

  const followUpCount = filtered.filter(
    (item) => Number(item.rating || 0) <= 2
  ).length;

  const handleDelete = async (item) => {
    const passengerLabel =
      item.passengerName ||
      item.employeeName ||
      item.flightNumber ||
      "this feedback";

    const confirmed = window.confirm(
      `Delete passenger feedback for ${passengerLabel}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      setActionMessage("");

      await deleteDoc(doc(db, "passenger_feedback", item.id));

      setActionMessage("Passenger feedback deleted.");
    } catch (error) {
      console.error("Passenger feedback delete failed:", error);
      setActionMessage("Could not delete passenger feedback.");
    } finally {
      setDeletingId("");
    }
  };

  const buildPrintableHtml = (item) => {
    const account =
      ACCOUNTS.find((entry) => entry.key === item.account) || null;

    const esc = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const stars = `${Number(item.rating || 0)} / 5`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Passenger Feedback Report</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 34px;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              background: #fff;
            }
            .header {
              border-bottom: 3px solid #1769aa;
              padding-bottom: 16px;
              margin-bottom: 22px;
            }
            .brand {
              font-size: 12px;
              font-weight: 700;
              letter-spacing: .08em;
              text-transform: uppercase;
              color: #1769aa;
            }
            h1 {
              margin: 6px 0 0;
              font-size: 28px;
            }
            .sub {
              margin-top: 5px;
              color: #64748b;
              font-size: 13px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
              margin-bottom: 18px;
            }
            .box {
              border: 1px solid #dbe3ee;
              border-radius: 10px;
              padding: 10px 12px;
            }
            .label {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: .05em;
              text-transform: uppercase;
              color: #64748b;
            }
            .value {
              margin-top: 4px;
              font-size: 14px;
              font-weight: 600;
            }
            .section {
              margin-top: 18px;
            }
            .section h2 {
              font-size: 16px;
              margin: 0 0 8px;
            }
            .comment {
              border: 1px solid #dbe3ee;
              border-radius: 10px;
              padding: 12px;
              white-space: pre-wrap;
              line-height: 1.5;
              font-size: 13px;
            }
            .contact {
              background: #eff6ff;
              border: 1px solid #bfdbfe;
            }
            .footer {
              margin-top: 28px;
              padding-top: 12px;
              border-top: 1px solid #e2e8f0;
              color: #94a3b8;
              font-size: 10px;
            }
            @media print {
              body { padding: 18px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">AeroStation Hub · Passenger Feedback</div>
            <h1>${esc(account?.label || item.accountLabel || item.account || "Passenger Feedback")}</h1>
            <div class="sub">Service date: ${esc(formatDate(item.serviceDate))}</div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Passenger</div>
              <div class="value">${esc(item.passengerName || "Not provided")}</div>
            </div>
            <div class="box">
              <div class="label">Employee</div>
              <div class="value">${esc(item.employeeName || item.employeeTypedFirstName || "Not provided")}</div>
            </div>
            <div class="box">
              <div class="label">Flight</div>
              <div class="value">${esc(item.flightNumber || "—")}</div>
            </div>
            <div class="box">
              <div class="label">PNR</div>
              <div class="value">${esc(item.pnr || "—")}</div>
            </div>
            <div class="box">
              <div class="label">Rating</div>
              <div class="value">${esc(stars)}</div>
            </div>
            <div class="box">
              <div class="label">Language</div>
              <div class="value">${esc(languageLabel(item.language))}</div>
            </div>
            <div class="box">
              <div class="label">Professional / Courteous</div>
              <div class="value">${esc(responseLabel(item.courteous))}</div>
            </div>
            <div class="box">
              <div class="label">Assistance Received</div>
              <div class="value">${esc(responseLabel(item.assistance))}</div>
            </div>
            <div class="box">
              <div class="label">Would Recommend</div>
              <div class="value">${esc(responseLabel(item.recommend))}</div>
            </div>
            <div class="box">
              <div class="label">Employee Match</div>
              <div class="value">${esc(item.employeeMatchStatus || "not provided")}</div>
            </div>
          </div>

          ${
            item.comment
              ? `
                <div class="section">
                  <h2>Passenger Comments</h2>
                  <div class="comment">${esc(item.comment)}</div>
                </div>
              `
              : ""
          }

          ${
            item.contactRequested
              ? `
                <div class="section">
                  <h2>Contact Requested</h2>
                  <div class="comment contact">
                    Email: ${esc(item.contactEmail || "—")}<br/>
                    Phone: ${esc(item.contactPhone || "—")}
                  </div>
                </div>
              `
              : ""
          }

          <div class="footer">
            Printed from AeroStation Hub · Passenger Feedback Management
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintExport = (item) => {
    const html = buildPrintableHtml(item);

    const printWindow = window.open(
      "",
      "_blank",
      "width=1100,height=850"
    );

    if (!printWindow) {
      setActionMessage(
        "Pop-up blocked. Please allow pop-ups to print/export PDF."
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 50%, #1769aa 76%, #4fb6e9 100%)",
          color: "#ffffff",
          borderRadius: 26,
          padding: 20,
          boxShadow: "0 22px 52px rgba(23,105,170,0.20)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: 900,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          AeroStation Hub · Management of Reports
        </div>

        <h1
          style={{
            margin: "7px 0 5px",
            fontSize: 28,
            lineHeight: 1.1,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          Passenger Feedback
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            fontSize: 13,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.84)",
          }}
        >
          Manage QR feedback links and review passenger experience for WCHR,
          Sun Country, and World Atlantic.
        </p>
      </section>

      <section>
        <div
          style={{
            marginBottom: 10,
            fontSize: 17,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          QR Feedback Codes
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 12,
          }}
        >
          {ACCOUNTS.map((account) => (
            <QrCard key={account.key} account={account} />
          ))}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
          gap: 10,
        }}
      >
        <StatCard
          label="Responses"
          value={total}
          helper="Based on the current filters"
        />
        <StatCard
          label="Average Rating"
          value={`${averageRating} ★`}
        />
        <StatCard
          label="5-Star Reviews"
          value={fiveStarPct}
          helper={`${fiveStarCount} five-star response${fiveStarCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Needs Follow-Up"
          value={followUpCount}
          helper="Ratings of 1 or 2 stars"
        />
      </section>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 20,
          padding: 14,
          boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
            gap: 10,
          }}
        >
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            style={fieldStyle}
          >
            <option value="ALL">All Accounts</option>
            {ACCOUNTS.map((account) => (
              <option key={account.key} value={account.key}>
                {account.label}
              </option>
            ))}
          </select>

          <select
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            style={fieldStyle}
          >
            <option value="ALL">All Employees</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            min="2026-07-01"
            max={todayString()}
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            style={fieldStyle}
          />

          <input
            type="date"
            min="2026-07-01"
            max={todayString()}
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            style={fieldStyle}
          />
        </div>

        <label
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 9,
            color: "#334155",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          <input
            type="checkbox"
            checked={needsFollowUpOnly}
            onChange={(event) =>
              setNeedsFollowUpOnly(event.target.checked)
            }
            style={{ width: 18, height: 18 }}
          />
          Show only feedback needing follow-up (1–2 stars)
        </label>
      </section>

      {loadError && (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            borderRadius: 16,
            padding: "13px 15px",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {loadError}
        </div>
      )}

      {actionMessage && (
        <div
          style={{
            background: actionMessage.includes("Could not") ? "#fff1f2" : "#ecfdf5",
            border: actionMessage.includes("Could not")
              ? "1px solid #fecdd3"
              : "1px solid #a7f3d0",
            color: actionMessage.includes("Could not") ? "#9f1239" : "#166534",
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {actionMessage}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gap: 10,
        }}
      >
        {loading ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 20,
              color: "#64748b",
              textAlign: "center",
            }}
          >
            Loading feedback...
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              padding: 24,
              color: "#64748b",
              textAlign: "center",
            }}
          >
            No passenger feedback matches the current filters.
          </div>
        ) : (
          filtered.map((item) => {
            const account =
              ACCOUNTS.find((entry) => entry.key === item.account) || null;

            const isFollowUp = Number(item.rating || 0) <= 2;

            return (
              <article
                key={item.id}
                style={{
                  background: "#ffffff",
                  border: isFollowUp
                    ? "1px solid #fecaca"
                    : "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 15,
                  boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      {item.passengerName || "Passenger name not provided"}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        color: "#64748b",
                        fontSize: 12,
                      }}
                    >
                      {account?.label || item.accountLabel || item.account || "—"} ·{" "}
                      {formatDate(item.serviceDate)} ·{" "}
                      {languageLabel(item.language)}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        color: "#334155",
                        fontSize: 12,
                        fontWeight: 750,
                      }}
                    >
                      Employee:{" "}
                      {item.employeeName
                        ? item.employeeName
                        : item.employeeTypedFirstName
                          ? `${item.employeeTypedFirstName} (${item.employeeMatchStatus === "ambiguous" ? "multiple matches" : "not matched"})`
                          : "Not provided"}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 999,
                      padding: "7px 10px",
                      fontSize: 13,
                      fontWeight: 900,
                      background: isFollowUp ? "#fff1f2" : "#fffbeb",
                      color: isFollowUp ? "#be123c" : "#a16207",
                      border: isFollowUp
                        ? "1px solid #fecdd3"
                        : "1px solid #fde68a",
                    }}
                  >
                    {Number(item.rating || 0)} ★
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 13,
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
                    gap: 8,
                  }}
                >
                  <MiniInfo
                    label="Flight"
                    value={item.flightNumber || "—"}
                  />
                  <MiniInfo
                    label="PNR"
                    value={item.pnr || "—"}
                  />
                  <MiniInfo
                    label="Employee Match"
                    value={
                      item.employeeMatchStatus === "matched"
                        ? "Matched"
                        : item.employeeMatchStatus === "ambiguous"
                          ? "Multiple matches"
                          : item.employeeMatchStatus === "not_found"
                            ? "Not found"
                            : "Not provided"
                    }
                  />
                  <MiniInfo
                    label="Professional"
                    value={responseLabel(item.courteous)}
                  />
                  <MiniInfo
                    label="Assistance"
                    value={responseLabel(item.assistance)}
                  />
                  <MiniInfo
                    label="Recommend"
                    value={responseLabel(item.recommend)}
                  />
                </div>


                {item.contactRequested && (
                  <div
                    style={{
                      marginTop: 11,
                      padding: "11px 12px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: 13,
                      color: "#1e3a5f",
                      fontSize: 12.5,
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontWeight: 900, marginBottom: 4 }}>
                      Passenger requested contact
                    </div>
                    <div>
                      Email: {item.contactEmail || "—"}
                    </div>
                    <div>
                      Phone: {item.contactPhone || "—"}
                    </div>
                  </div>
                )}

                {item.employeeMatchStatus === "ambiguous" &&
                  Array.isArray(item.employeeMatchCandidates) &&
                  item.employeeMatchCandidates.length > 0 && (
                    <div
                      style={{
                        marginTop: 11,
                        padding: "11px 12px",
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: 13,
                        color: "#9a3412",
                        fontSize: 12.5,
                        lineHeight: 1.55,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>
                        Employee match needs review
                      </div>
                      Possible matches:{" "}
                      {item.employeeMatchCandidates
                        .map((candidate) => candidate?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}

                {item.comment && (
                  <div
                    style={{
                      marginTop: 11,
                      padding: "11px 12px",
                      background: "#f8fafc",
                      borderRadius: 13,
                      color: "#475569",
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.comment}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 13,
                    paddingTop: 12,
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handlePrintExport(item)}
                    style={{
                      minHeight: 42,
                      borderRadius: 12,
                      border: "1px solid #bfdbfe",
                      background: "#ffffff",
                      color: "#1769aa",
                      fontSize: 12,
                      fontWeight: 850,
                      padding: "9px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Print / Export PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    style={{
                      minHeight: 42,
                      borderRadius: 12,
                      border: "1px solid #fecaca",
                      background: "#fff1f2",
                      color: "#be123c",
                      fontSize: 12,
                      fontWeight: 850,
                      padding: "9px 12px",
                      cursor: deletingId === item.id ? "not-allowed" : "pointer",
                      opacity: deletingId === item.id ? 0.65 : 1,
                    }}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #e5eef8",
        borderRadius: 12,
        padding: "9px 10px",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: 9,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 3,
          color: "#334155",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  minHeight: 46,
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 13,
  padding: "10px 11px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
};

const primaryButton = {
  minHeight: 45,
  border: "none",
  borderRadius: 13,
  background: "#1769aa",
  color: "#ffffff",
  fontWeight: 850,
  cursor: "pointer",
};

const secondaryButton = {
  minHeight: 45,
  border: "1px solid #bfdbfe",
  borderRadius: 13,
  background: "#ffffff",
  color: "#1769aa",
  fontWeight: 850,
  cursor: "pointer",
};
