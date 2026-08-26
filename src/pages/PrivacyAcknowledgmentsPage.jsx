// src/pages/PrivacyAcknowledgmentsPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const CURRENT_POLICY_VERSION = "2026.08.26";

function getUserName(user) {
  return (
    user?.employeeName ||
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Unknown User"
  );
}

function formatRole(role) {
  const value = String(role || "").trim();

  if (!value) return "—";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) return "—";

  try {
    let date = null;

    if (typeof value?.toDate === "function") {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else {
      date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    console.error("Could not format privacy timestamp:", error);
    return "—";
  }
}

export default function PrivacyAcknowledgmentsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const snapshot = await getDocs(collection(db, "users"));

      const rows = snapshot.docs.map((userDoc) => {
        const data = userDoc.data();

        const acceptedCurrent =
          data?.privacyPolicyAccepted === true &&
          data?.privacyPolicyVersion === CURRENT_POLICY_VERSION;

        return {
          id: userDoc.id,
          ...data,

          displayName: getUserName(data),

          privacyStatus: acceptedCurrent
            ? "accepted"
            : "pending",

          privacyAcceptedAt:
            data?.privacyPolicyAcceptedAt || null,

          privacyVersion:
            data?.privacyPolicyVersion || "",
        };
      });

      rows.sort((a, b) =>
        String(a.displayName || "").localeCompare(
          String(b.displayName || "")
        )
      );

      setUsers(rows);
    } catch (err) {
      console.error(
        "Error loading privacy acknowledgments:",
        err
      );

      setError(
        "Unable to load privacy acknowledgment records."
      );
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = users.length;

    const accepted = users.filter(
      (user) => user.privacyStatus === "accepted"
    ).length;

    const pending = total - accepted;

    const percentage =
      total > 0
        ? Math.round((accepted / total) * 100)
        : 0;

    return {
      total,
      accepted,
      pending,
      percentage,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const cleanSearch = search
      .trim()
      .toLowerCase();

    return users.filter((user) => {
      const matchesStatus =
        statusFilter === "all" ||
        user.privacyStatus === statusFilter;

      if (!matchesStatus) return false;

      if (!cleanSearch) return true;

      const haystack = [
        user.displayName,
        user.username,
        user.role,
        user.department,
        user.position,
        user.privacyVersion,
      ]
        .map((value) =>
          String(value || "").toLowerCase()
        )
        .join(" ");

      return haystack.includes(cleanSearch);
    });
  }, [users, search, statusFilter]);

  return (
    <div style={pageStyle}>

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div style={headerStyle}>

        <div>
          <div style={eyebrowStyle}>
            ADMINISTRATION
          </div>

          <h1 style={titleStyle}>
            Privacy Acknowledgments
          </h1>

          <p style={subtitleStyle}>
            Review employee acknowledgment status for
            the current Privacy, Confidentiality &amp;
            Ownership Policy.
          </p>
        </div>

        <button
          type="button"
          onClick={loadUsers}
          disabled={loading}
          style={refreshButtonStyle}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>

      </div>

      {/* =====================================================
          CURRENT POLICY
      ===================================================== */}

      <div style={policyBannerStyle}>

        <div style={policyIconStyle}>
          🔒
        </div>

        <div>
          <div style={policyLabelStyle}>
            CURRENT POLICY VERSION
          </div>

          <div style={policyVersionStyle}>
            {CURRENT_POLICY_VERSION}
          </div>

          <div style={policyDescriptionStyle}>
            Privacy, Confidentiality &amp; Ownership
            Policy
          </div>
        </div>

      </div>

      {/* =====================================================
          STATS
      ===================================================== */}

      <div style={statsGridStyle}>

        <StatCard
          label="Total Users"
          value={stats.total}
          detail="System accounts"
        />

        <StatCard
          label="Accepted"
          value={stats.accepted}
          detail="Current policy"
        />

        <StatCard
          label="Pending"
          value={stats.pending}
          detail="Acknowledgment required"
        />

        <StatCard
          label="Compliance"
          value={`${stats.percentage}%`}
          detail="Current policy"
        />

      </div>

      {/* =====================================================
          PROGRESS
      ===================================================== */}

      <div style={progressCardStyle}>

        <div style={progressHeaderStyle}>
          <div>
            <div style={progressTitleStyle}>
              Acknowledgment Progress
            </div>

            <div style={progressSubtitleStyle}>
              {stats.accepted} of {stats.total} users
              have acknowledged the current policy.
            </div>
          </div>

          <strong style={progressPercentStyle}>
            {stats.percentage}%
          </strong>
        </div>

        <div style={progressTrackStyle}>
          <div
            style={{
              ...progressFillStyle,
              width: `${stats.percentage}%`,
            }}
          />
        </div>

      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <div style={filterCardStyle}>

        <input
          type="text"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search employee, username, role..."
          style={searchStyle}
        />

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
          style={selectStyle}
        >
          <option value="all">
            All Statuses
          </option>

          <option value="accepted">
            Accepted
          </option>

          <option value="pending">
            Pending
          </option>
        </select>

      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {/* =====================================================
          TABLE
      ===================================================== */}

      <div style={tableCardStyle}>

        <div style={tableTopStyle}>
          <div>
            <strong style={tableTitleStyle}>
              User Records
            </strong>

            <div style={tableCountStyle}>
              Showing {filteredUsers.length} of{" "}
              {users.length} users
            </div>
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>
            Loading privacy records...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={emptyStyle}>
            No matching users found.
          </div>
        ) : (
          <div style={tableWrapperStyle}>

            <table style={tableStyle}>

              <thead>
                <tr>

                  <TableHeader>
                    Employee
                  </TableHeader>

                  <TableHeader>
                    Username
                  </TableHeader>

                  <TableHeader>
                    Role
                  </TableHeader>

                  <TableHeader>
                    Status
                  </TableHeader>

                  <TableHeader>
                    Policy Version
                  </TableHeader>

                  <TableHeader>
                    Accepted
                  </TableHeader>

                </tr>
              </thead>

              <tbody>

                {filteredUsers.map((user) => (

                  <tr
                    key={user.id}
                    style={rowStyle}
                  >

                    <TableCell>

                      <div style={employeeCellStyle}>

                        <div style={avatarStyle}>
                          {getInitials(
                            user.displayName
                          )}
                        </div>

                        <div>

                          <div style={employeeNameStyle}>
                            {user.displayName}
                          </div>

                          {(user.position ||
                            user.department) && (
                            <div
                              style={
                                employeeDetailStyle
                              }
                            >
                              {[
                                user.position,
                                user.department,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          )}

                        </div>

                      </div>

                    </TableCell>

                    <TableCell>
                      {user.username || "—"}
                    </TableCell>

                    <TableCell>
                      {formatRole(user.role)}
                    </TableCell>

                    <TableCell>

                      <StatusBadge
                        status={
                          user.privacyStatus
                        }
                      />

                    </TableCell>

                    <TableCell>

                      {user.privacyVersion ? (
                        <span
                          style={
                            versionBadgeStyle
                          }
                        >
                          {user.privacyVersion}
                        </span>
                      ) : (
                        "—"
                      )}

                    </TableCell>

                    <TableCell>

                      {user.privacyStatus ===
                      "accepted"
                        ? formatTimestamp(
                            user.privacyAcceptedAt
                          )
                        : "—"}

                    </TableCell>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* =====================================================
          FOOTNOTE
      ===================================================== */}

      <div style={footnoteStyle}>
        <strong>Electronic acknowledgment records:</strong>{" "}
        An Accepted status indicates that the user's
        account contains acknowledgment of the current
        policy version. Pending indicates that the
        current version has not yet been recorded for
        that account.
      </div>

    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}) {
  return (
    <div style={statCardStyle}>

      <div style={statLabelStyle}>
        {label}
      </div>

      <div style={statValueStyle}>
        {value}
      </div>

      <div style={statDetailStyle}>
        {detail}
      </div>

    </div>
  );
}

function StatusBadge({ status }) {
  const accepted = status === "accepted";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 900,

        background: accepted
          ? "#ecfdf5"
          : "#fff7ed",

        color: accepted
          ? "#047857"
          : "#c2410c",

        border: accepted
          ? "1px solid #a7f3d0"
          : "1px solid #fed7aa",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: accepted
            ? "#10b981"
            : "#f97316",
        }}
      />

      {accepted ? "Accepted" : "Pending"}
    </span>
  );
}

function TableHeader({ children }) {
  return (
    <th style={tableHeaderStyle}>
      {children}
    </th>
  );
}

function TableCell({ children }) {
  return (
    <td style={tableCellStyle}>
      {children}
    </td>
  );
}

function getInitials(name) {
  const clean = String(name || "").trim();

  if (!clean) return "U";

  const parts = clean
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase();
  }

  return `${parts[0][0] || ""}${
    parts[1][0] || ""
  }`.toUpperCase();
}

// ============================================================
// STYLES
// ============================================================

const pageStyle = {
  width: "100%",
  display: "grid",
  gap: 18,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  flexWrap: "wrap",
};

const eyebrowStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "#1769aa",
  letterSpacing: "0.14em",
};

const titleStyle = {
  margin: "5px 0 6px",
  fontSize: "clamp(28px, 4vw, 40px)",
  fontWeight: 900,
  letterSpacing: "-0.04em",
  color: "#0f172a",
};

const subtitleStyle = {
  margin: 0,
  maxWidth: 700,
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.7,
};

const refreshButtonStyle = {
  border: "1px solid #cfe7fb",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 14,
  padding: "11px 17px",
  fontWeight: 900,
  cursor: "pointer",
};

const policyBannerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 15,
  padding: 18,
  background:
    "linear-gradient(135deg, #0f4c81 0%, #1769aa 60%, #5aa9e6 100%)",
  borderRadius: 20,
  color: "#ffffff",
  boxShadow:
    "0 16px 32px rgba(23,105,170,0.18)",
};

const policyIconStyle = {
  width: 50,
  height: 50,
  borderRadius: 15,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.15)",
  fontSize: 22,
};

const policyLabelStyle = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.13em",
  opacity: 0.8,
};

const policyVersionStyle = {
  marginTop: 2,
  fontSize: 19,
  fontWeight: 900,
};

const policyDescriptionStyle = {
  marginTop: 2,
  fontSize: 11,
  opacity: 0.88,
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const statCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  boxShadow:
    "0 8px 24px rgba(15,23,42,0.05)",
};

const statLabelStyle = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const statValueStyle = {
  marginTop: 6,
  fontSize: 30,
  fontWeight: 900,
  color: "#0f172a",
};

const statDetailStyle = {
  marginTop: 3,
  fontSize: 11,
  color: "#94a3b8",
};

const progressCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
};

const progressHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
};

const progressTitleStyle = {
  fontSize: 14,
  fontWeight: 900,
  color: "#0f172a",
};

const progressSubtitleStyle = {
  marginTop: 3,
  fontSize: 11,
  color: "#64748b",
};

const progressPercentStyle = {
  fontSize: 20,
  color: "#1769aa",
};

const progressTrackStyle = {
  marginTop: 14,
  height: 10,
  borderRadius: 999,
  background: "#e2e8f0",
  overflow: "hidden",
};

const progressFillStyle = {
  height: "100%",
  borderRadius: 999,
  background:
    "linear-gradient(90deg, #1769aa, #5aa9e6)",
  transition: "width 0.3s ease",
};

const filterCardStyle = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 1fr) minmax(160px, 220px)",
  gap: 10,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 14,
};

const searchStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 13,
  padding: "11px 13px",
  fontSize: 13,
  outline: "none",
};

const selectStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 13,
  padding: "11px 13px",
  background: "#ffffff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 700,
};

const tableCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  overflow: "hidden",
  boxShadow:
    "0 10px 30px rgba(15,23,42,0.05)",
};

const tableTopStyle = {
  padding: "17px 18px",
  borderBottom: "1px solid #e2e8f0",
};

const tableTitleStyle = {
  color: "#0f172a",
  fontSize: 14,
};

const tableCountStyle = {
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 10,
};

const tableWrapperStyle = {
  overflowX: "auto",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 850,
};

const tableHeaderStyle = {
  textAlign: "left",
  padding: "12px 15px",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
};

const tableCellStyle = {
  padding: "13px 15px",
  borderBottom: "1px solid #f1f5f9",
  color: "#475569",
  fontSize: 12,
  verticalAlign: "middle",
};

const rowStyle = {
  background: "#ffffff",
};

const employeeCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const avatarStyle = {
  width: 35,
  height: 35,
  flex: "0 0 35px",
  borderRadius: 11,
  background:
    "linear-gradient(135deg, #dff0ff, #eef8ff)",
  color: "#1769aa",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 900,
};

const employeeNameStyle = {
  fontWeight: 900,
  color: "#0f172a",
};

const employeeDetailStyle = {
  marginTop: 2,
  fontSize: 9,
  color: "#94a3b8",
};

const versionBadgeStyle = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 8,
  background: "#f1f5f9",
  color: "#475569",
  fontSize: 10,
  fontWeight: 800,
};

const errorStyle = {
  padding: 14,
  borderRadius: 14,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  fontSize: 12,
  fontWeight: 800,
};

const emptyStyle = {
  padding: 40,
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const footnoteStyle = {
  padding: "14px 16px",
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  borderRadius: 16,
  color: "#64748b",
  fontSize: 10.5,
  lineHeight: 1.65,
};
