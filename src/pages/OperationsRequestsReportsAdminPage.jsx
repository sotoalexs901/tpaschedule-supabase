import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 100,
        fontFamily: "inherit",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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

function ActionButton({
  children,
  onClick,
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
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
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

function getRequestTypeLabel(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "supplies") return "Supplies Request";
  if (v === "uniform") return "Uniform Submit";
  if (v === "aa_ot") return "AA OT Request";
  if (v === "sy_ot") return "SY OT Request";
  if (v === "wl_ot") return "WL OT Request";
  if (v === "av_ot") return "AV OT Request";

  return value || "—";
}

function getManagerStatusLabel(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "submitted") return "Submitted";
  if (v === "received") return "Received";
  if (v === "reviewed") return "Reviewed";
  if (v === "accepted") return "Accepted";
  if (v === "closed") return "Closed";

  return "Submitted";
}

function getManagerStatusStyle(value) {
  const v = String(value || "submitted").trim().toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 11px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (v === "received") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (v === "reviewed") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#b45309",
      borderColor: "#fdba74",
    };
  }

  if (v === "accepted") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#047857",
      borderColor: "#a7f3d0",
    };
  }

  if (v === "closed") {
    return {
      ...base,
      background: "#f1f5f9",
      color: "#334155",
      borderColor: "#cbd5e1",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "—";
    }
  }
  return String(value);
}

function getUserDisplayName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function getComparableNames(report) {
  return [
    report?.submittedBy,
    report?.submittedByName,
    report?.employeeName,
    report?.requestedBy,
    report?.submittedByUsername,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
}

function getTimelineItems(report) {
  return [
    {
      label: "Submitted",
      time: report?.createdAt,
      by:
        report?.submittedBy ||
        report?.submittedByName ||
        report?.submittedByUsername ||
        report?.employeeName ||
        "—",
    },
    {
      label: "Received",
      time: report?.receivedAt,
      by: report?.receivedByName || report?.followUpByName || "—",
    },
    {
      label: "Reviewed",
      time: report?.reviewedAt,
      by: report?.reviewedByName || report?.followUpByName || "—",
    },
    {
      label: "Accepted",
      time: report?.acceptedAt,
      by: report?.acceptedByName || report?.followUpByName || "—",
    },
    {
      label: "Closed",
      time: report?.closedAt,
      by: report?.closedByName || report?.followUpByName || "—",
    },
  ].filter((item) => item.time);
}

export default function OperationsRequestsReportsAdminPage() {
  const { user } = useUser();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [savingEditId, setSavingEditId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const [filters, setFilters] = useState({
    requestType: "all",
    search: "",
  });

  const [editData, setEditData] = useState({
    requestType: "",
    date: "",
    airline: "",
    department: "",
    submittedBy: "",
    submittedByName: "",
    submittedByUsername: "",
    email: "",
    items: "",
    pictureNotes: "",
    employeeName: "",
    employeeNumber: "",
    phoneNumber: "",
    totalAmount: "",
    receiptNotes: "",
    employeeSignature: "",
    flightNumber: "",
    tailNumber: "",
    delayedTime: "",
    delayedCode: "",
    reason: "",
    requestedHours: "",
    requestedBy: "",
    status: "submitted",
    managerStatus: "submitted",
    managerComments: "",
    followUpByName: "",
  });

  const isManager =
    user?.role === "duty_manager" || user?.role === "station_manager";
  const isSupervisor = user?.role === "supervisor";
  const canAccess = isManager || isSupervisor;

  useEffect(() => {
    async function loadData() {
      try {
        const qReports = query(
          collection(db, "supplies_uniform_ot_requests"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(qReports);
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        setStatusMessage("Could not load request reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) loadData();
    else setLoading(false);
  }, [canAccess]);

  const visibleReports = useMemo(() => {
    const normalizedUsername = String(user?.username || "")
      .trim()
      .toLowerCase();
    const normalizedDisplayName = String(
      user?.displayName || user?.fullName || user?.name || ""
    )
      .trim()
      .toLowerCase();

    return reports
      .filter((item) => !item.archived)
      .filter((item) => {
        if (isSupervisor) {
          const possibleNames = getComparableNames(item);
          const sameUserId =
            item.submittedByUserId && user?.id
              ? String(item.submittedByUserId) === String(user.id)
              : false;
          const sameUsername =
            normalizedUsername &&
            possibleNames.includes(normalizedUsername);
          const sameDisplayName =
            normalizedDisplayName &&
            possibleNames.includes(normalizedDisplayName);

          if (!sameUserId && !sameUsername && !sameDisplayName) {
            return false;
          }
        }

        if (
          filters.requestType !== "all" &&
          String(item.requestType || "") !== filters.requestType
        ) {
          return false;
        }

        const haystack = [
          item.requestType,
          item.date,
          item.airline,
          item.department,
          item.submittedBy,
          item.submittedByName,
          item.employeeName,
          item.flightNumber,
          item.requestedBy,
          item.managerStatus,
          item.followUpByName,
          item.managerComments,
        ]
          .join(" ")
          .toLowerCase();

        if (
          filters.search &&
          !haystack.includes(filters.search.toLowerCase().trim())
        ) {
          return false;
        }

        return true;
      });
  }, [reports, filters, isSupervisor, user]);

  const selectedReport = useMemo(() => {
    return visibleReports.find((item) => item.id === selectedId) || null;
  }, [visibleReports, selectedId]);

  useEffect(() => {
    if (!selectedId && visibleReports.length) {
      setSelectedId(visibleReports[0].id);
      return;
    }

    if (selectedId && !visibleReports.some((item) => item.id === selectedId)) {
      setSelectedId(visibleReports[0]?.id || "");
    }
  }, [selectedId, visibleReports]);

  useEffect(() => {
    if (!selectedReport) {
      setEditData({
        requestType: "",
        date: "",
        airline: "",
        department: "",
        submittedBy: "",
        submittedByName: "",
        submittedByUsername: "",
        email: "",
        items: "",
        pictureNotes: "",
        employeeName: "",
        employeeNumber: "",
        phoneNumber: "",
        totalAmount: "",
        receiptNotes: "",
        employeeSignature: "",
        flightNumber: "",
        tailNumber: "",
        delayedTime: "",
        delayedCode: "",
        reason: "",
        requestedHours: "",
        requestedBy: "",
        status: "submitted",
        managerStatus: "submitted",
        managerComments: "",
        followUpByName: "",
      });
      setIsEditMode(false);
      return;
    }

    setEditData({
      requestType: selectedReport.requestType || "",
      date: selectedReport.date || "",
      airline: selectedReport.airline || "",
      department: selectedReport.department || "",
      submittedBy: selectedReport.submittedBy || "",
      submittedByName: selectedReport.submittedByName || "",
      submittedByUsername: selectedReport.submittedByUsername || "",
      email: selectedReport.email || "",
      items: selectedReport.items || "",
      pictureNotes: selectedReport.pictureNotes || "",
      employeeName: selectedReport.employeeName || "",
      employeeNumber: selectedReport.employeeNumber || "",
      phoneNumber: selectedReport.phoneNumber || "",
      totalAmount: selectedReport.totalAmount || "",
      receiptNotes: selectedReport.receiptNotes || "",
      employeeSignature: selectedReport.employeeSignature || "",
      flightNumber: selectedReport.flightNumber || "",
      tailNumber: selectedReport.tailNumber || "",
      delayedTime: selectedReport.delayedTime || "",
      delayedCode: selectedReport.delayedCode || "",
      reason: selectedReport.reason || "",
      requestedHours: selectedReport.requestedHours || "",
      requestedBy: selectedReport.requestedBy || "",
      status: selectedReport.status || "submitted",
      managerStatus: selectedReport.managerStatus || selectedReport.status || "submitted",
      managerComments: selectedReport.managerComments || "",
      followUpByName: selectedReport.followUpByName || "",
    });
  }, [selectedReport]);

  const handleEditField = (field, value) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleArchive = async () => {
    if (!selectedReport || !isManager) return;

    try {
      setArchivingId(selectedReport.id);

      await updateDoc(doc(db, "supplies_uniform_ot_requests", selectedReport.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedByName: getUserDisplayName(user),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id ? { ...item, archived: true } : item
        )
      );

      setStatusMessage("Request archived.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not archive request.");
    } finally {
      setArchivingId("");
    }
  };

  const handleDelete = async () => {
    if (!selectedReport || !isManager) return;

    const ok = window.confirm("Delete this request permanently?");
    if (!ok) return;

    try {
      setDeletingId(selectedReport.id);
      await deleteDoc(doc(db, "supplies_uniform_ot_requests", selectedReport.id));
      setReports((prev) => prev.filter((item) => item.id !== selectedReport.id));
      setStatusMessage("Request deleted.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not delete request.");
    } finally {
      setDeletingId("");
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedReport || !isManager) return;

    try {
      setSavingEditId(selectedReport.id);

      const nextManagerStatus = String(
        editData.managerStatus || editData.status || "submitted"
      ).toLowerCase();

      const updatePayload = {
        ...editData,
        status: nextManagerStatus,
        managerStatus: nextManagerStatus,
        managerComments: editData.managerComments || "",
        followUpByName: editData.followUpByName || getUserDisplayName(user),
        updatedAt: serverTimestamp(),
        updatedByName: getUserDisplayName(user),
      };

      if (nextManagerStatus === "received" && !selectedReport.receivedAt) {
        updatePayload.receivedAt = serverTimestamp();
        updatePayload.receivedByName = getUserDisplayName(user);
      }

      if (nextManagerStatus === "reviewed" && !selectedReport.reviewedAt) {
        updatePayload.reviewedAt = serverTimestamp();
        updatePayload.reviewedByName = getUserDisplayName(user);
      }

      if (nextManagerStatus === "accepted" && !selectedReport.acceptedAt) {
        updatePayload.acceptedAt = serverTimestamp();
        updatePayload.acceptedByName = getUserDisplayName(user);
      }

      if (nextManagerStatus === "closed" && !selectedReport.closedAt) {
        updatePayload.closedAt = serverTimestamp();
        updatePayload.closedByName = getUserDisplayName(user);
      }

      await updateDoc(
        doc(db, "supplies_uniform_ot_requests", selectedReport.id),
        updatePayload
      );

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                ...editData,
                status: nextManagerStatus,
                managerStatus: nextManagerStatus,
                managerComments: editData.managerComments || "",
                followUpByName: editData.followUpByName || getUserDisplayName(user),
                receivedByName:
                  nextManagerStatus === "received"
                    ? getUserDisplayName(user)
                    : item.receivedByName,
                reviewedByName:
                  nextManagerStatus === "reviewed"
                    ? getUserDisplayName(user)
                    : item.reviewedByName,
                acceptedByName:
                  nextManagerStatus === "accepted"
                    ? getUserDisplayName(user)
                    : item.acceptedByName,
                closedByName:
                  nextManagerStatus === "closed"
                    ? getUserDisplayName(user)
                    : item.closedByName,
                receivedAt:
                  nextManagerStatus === "received" && !item.receivedAt
                    ? new Date()
                    : item.receivedAt,
                reviewedAt:
                  nextManagerStatus === "reviewed" && !item.reviewedAt
                    ? new Date()
                    : item.reviewedAt,
                acceptedAt:
                  nextManagerStatus === "accepted" && !item.acceptedAt
                    ? new Date()
                    : item.acceptedAt,
                closedAt:
                  nextManagerStatus === "closed" && !item.closedAt
                    ? new Date()
                    : item.closedAt,
              }
            : item
        )
      );

      setStatusMessage("Request updated successfully.");
      setIsEditMode(false);
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not save request edits.");
    } finally {
      setSavingEditId("");
    }
  };

  const handleExportPdf = () => {
    if (!selectedReport) return;

    const printableWindow = window.open("", "_blank", "width=1000,height=900");
    if (!printableWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to export PDF.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${getRequestTypeLabel(selectedReport.requestType)}</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              padding: 24px;
              color: #0f172a;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            .subtitle {
              color: #475569;
              font-size: 14px;
              margin-bottom: 24px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px;
            }
            .card {
              border: 1px solid #dbeafe;
              border-radius: 14px;
              padding: 12px 14px;
              background: #f8fbff;
            }
            .label {
              font-size: 11px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .value {
              margin-top: 6px;
              font-size: 14px;
              font-weight: 700;
              white-space: pre-wrap;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <h1>${getRequestTypeLabel(selectedReport.requestType)}</h1>
          <div class="subtitle">
            ${selectedReport.date || "—"} · ${
      selectedReport.submittedBy ||
      selectedReport.submittedByName ||
      selectedReport.employeeName ||
      "—"
    }
          </div>

          <div class="grid">
            ${Object.entries(selectedReport)
              .filter(
                ([key]) =>
                  ![
                    "id",
                    "archived",
                    "archivedAt",
                    "createdAt",
                    "updatedAt",
                    "submittedByUserId",
                    "submittedByUsername",
                    "submittedByRole",
                    "updatedByName",
                    "archivedByName",
                  ].includes(key)
              )
              .map(
                ([key, value]) => `
                  <div class="card">
                    <div class="label">${key}</div>
                    <div class="value">${safeValue(value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printableWindow.document.open();
    printableWindow.document.write(html);
    printableWindow.document.close();
  };

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 22 }}>
        Only Supervisors, Duty Managers and Station Managers can view this page.
      </PageCard>
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
          TPA OPS · Requests Reports
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
          {isSupervisor
            ? "My Submitted Operational Reports"
            : "Supplies, Uniform & OT Requests Reports"}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {isSupervisor
            ? "Track your submitted reports, review status, comments and duty manager follow-up."
            : "Review, edit, archive, delete and export submitted requests."}
        </p>
      </div>

      {statusMessage && (
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
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Request Type</FieldLabel>
            <SelectInput
              value={filters.requestType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, requestType: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="supplies">Supplies Request</option>
              <option value="uniform">Uniform Submit</option>
              <option value="aa_ot">AA OT Request</option>
              <option value="sy_ot">SY OT Request</option>
              <option value="wl_ot">WL OT Request</option>
              <option value="av_ot">AV OT Request</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Search</FieldLabel>
            <TextInput
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Airline, employee, date, flight, status..."
            />
          </div>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.95fr) minmax(520px, 1.25fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18 }}>
          <h2
            style={{
              marginTop: 0,
              marginBottom: 14,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Reports
          </h2>

          {loading ? (
            <div>Loading...</div>
          ) : visibleReports.length === 0 ? (
            <div>No reports found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {visibleReports.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setIsEditMode(false);
                  }}
                  style={{
                    cursor: "pointer",
                    border:
                      item.id === selectedId
                        ? "1px solid #bfe0fb"
                        : "1px solid #e2e8f0",
                    background: item.id === selectedId ? "#edf7ff" : "#fff",
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      {getRequestTypeLabel(item.requestType)}
                    </div>
                    <span style={getManagerStatusStyle(item.managerStatus || item.status)}>
                      {getManagerStatusLabel(item.managerStatus || item.status)}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#64748b",
                      marginTop: 6,
                    }}
                  >
                    {item.date || "—"} · {item.airline || item.department || "—"}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#1769aa",
                      marginTop: 4,
                      fontWeight: 700,
                    }}
                  >
                    {item.submittedBy ||
                      item.submittedByName ||
                      item.employeeName ||
                      "—"}
                  </div>

                  {item.followUpByName && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginTop: 6,
                        fontWeight: 700,
                      }}
                    >
                      Follow up by: {item.followUpByName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            {!isEditMode ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {getRequestTypeLabel(selectedReport.requestType)}
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      Submitted by{" "}
                      {selectedReport.submittedBy ||
                        selectedReport.submittedByName ||
                        selectedReport.employeeName ||
                        "—"}
                      {" · "}
                      {selectedReport.date || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={getManagerStatusStyle(selectedReport.managerStatus || selectedReport.status)}>
                      {getManagerStatusLabel(selectedReport.managerStatus || selectedReport.status)}
                    </span>

                    <ActionButton
                      variant="secondary"
                      onClick={handleExportPdf}
                    >
                      Export PDF
                    </ActionButton>

                    {isManager && (
                      <ActionButton
                        variant="primary"
                        onClick={() => setIsEditMode(true)}
                      >
                        Edit
                      </ActionButton>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #dbeafe",
                      borderRadius: 14,
                      padding: "12px 14px",
                      background: "#f8fbff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Current Status
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span style={getManagerStatusStyle(selectedReport.managerStatus || selectedReport.status)}>
                        {getManagerStatusLabel(selectedReport.managerStatus || selectedReport.status)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #dbeafe",
                      borderRadius: 14,
                      padding: "12px 14px",
                      background: "#f8fbff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Follow Up By
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {selectedReport.followUpByName || "—"}
                    </div>
                  </div>
                </div>

                {selectedReport.managerComments && (
                  <div
                    style={{
                      border: "1px solid #fed7aa",
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#9a3412",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                      }}
                    >
                      Manager Comments
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#7c2d12",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.7,
                        fontWeight: 700,
                      }}
                    >
                      {selectedReport.managerComments}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 16,
                    padding: "14px 16px",
                    background: "#f8fbff",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 10,
                    }}
                  >
                    Status Timeline
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {getTimelineItems(selectedReport).length === 0 ? (
                      <div
                        style={{
                          fontSize: 14,
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        No status timeline available yet.
                      </div>
                    ) : (
                      getTimelineItems(selectedReport).map((item, index) => (
                        <div
                          key={`${item.label}-${index}`}
                          style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            background: "#ffffff",
                            border: "1px solid #dbeafe",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: "#0f172a",
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                fontWeight: 700,
                              }}
                            >
                              {formatDateTime(item.time)}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 13,
                              color: "#475569",
                              fontWeight: 700,
                            }}
                          >
                            By: {item.by || "—"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {Object.entries(selectedReport).map(([key, value]) => {
                    if (
                      [
                        "id",
                        "archived",
                        "createdAt",
                        "archivedAt",
                        "updatedAt",
                        "managerComments",
                        "followUpByName",
                        "managerStatus",
                        "receivedAt",
                        "receivedByName",
                        "reviewedAt",
                        "reviewedByName",
                        "acceptedAt",
                        "acceptedByName",
                        "closedAt",
                        "closedByName",
                      ].includes(key)
                    ) {
                      return null;
                    }

                    return (
                      <div
                        key={key}
                        style={{
                          border: "1px solid #dbeafe",
                          borderRadius: 14,
                          padding: "10px 12px",
                          background: "#f8fbff",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#64748b",
                            textTransform: "uppercase",
                          }}
                        >
                          {key}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontWeight: 700,
                            color: "#0f172a",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {safeValue(value)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isManager && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginTop: 6,
                    }}
                  >
                    <ActionButton
                      variant="warning"
                      onClick={handleArchive}
                      disabled={archivingId === selectedReport.id}
                    >
                      {archivingId === selectedReport.id
                        ? "Archiving..."
                        : "Archive"}
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={handleDelete}
                      disabled={deletingId === selectedReport.id}
                    >
                      {deletingId === selectedReport.id
                        ? "Deleting..."
                        : "Delete"}
                    </ActionButton>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      Edit Request
                    </h2>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {getRequestTypeLabel(editData.requestType)}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton
                      variant="secondary"
                      onClick={() => setIsEditMode(false)}
                    >
                      Cancel
                    </ActionButton>

                    <ActionButton
                      variant="success"
                      onClick={handleSaveEdits}
                      disabled={savingEditId === selectedReport.id}
                    >
                      {savingEditId === selectedReport.id
                        ? "Saving..."
                        : "Save Edits"}
                    </ActionButton>
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
                    <FieldLabel>Request Type</FieldLabel>
                    <TextInput value={getRequestTypeLabel(editData.requestType)} disabled />
                  </div>

                  <div>
                    <FieldLabel>Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={editData.date}
                      onChange={(e) => handleEditField("date", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Airline</FieldLabel>
                    <TextInput
                      value={editData.airline}
                      onChange={(e) => handleEditField("airline", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Department</FieldLabel>
                    <TextInput
                      value={editData.department}
                      onChange={(e) =>
                        handleEditField("department", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Submitted By</FieldLabel>
                    <TextInput
                      value={editData.submittedBy}
                      onChange={(e) =>
                        handleEditField("submittedBy", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Email</FieldLabel>
                    <TextInput
                      value={editData.email}
                      onChange={(e) => handleEditField("email", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Employee Name</FieldLabel>
                    <TextInput
                      value={editData.employeeName}
                      onChange={(e) =>
                        handleEditField("employeeName", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Employee Number</FieldLabel>
                    <TextInput
                      value={editData.employeeNumber}
                      onChange={(e) =>
                        handleEditField("employeeNumber", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Phone Number</FieldLabel>
                    <TextInput
                      value={editData.phoneNumber}
                      onChange={(e) =>
                        handleEditField("phoneNumber", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Total Amount</FieldLabel>
                    <TextInput
                      value={editData.totalAmount}
                      onChange={(e) =>
                        handleEditField("totalAmount", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Flight Number</FieldLabel>
                    <TextInput
                      value={editData.flightNumber}
                      onChange={(e) =>
                        handleEditField("flightNumber", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Tail Number</FieldLabel>
                    <TextInput
                      value={editData.tailNumber}
                      onChange={(e) =>
                        handleEditField("tailNumber", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Time</FieldLabel>
                    <TextInput
                      value={editData.delayedTime}
                      onChange={(e) =>
                        handleEditField("delayedTime", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Code</FieldLabel>
                    <TextInput
                      value={editData.delayedCode}
                      onChange={(e) =>
                        handleEditField("delayedCode", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Requested Hours</FieldLabel>
                    <TextInput
                      value={editData.requestedHours}
                      onChange={(e) =>
                        handleEditField("requestedHours", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Requested By</FieldLabel>
                    <TextInput
                      value={editData.requestedBy}
                      onChange={(e) =>
                        handleEditField("requestedBy", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Employee Signature</FieldLabel>
                    <TextInput
                      value={editData.employeeSignature}
                      onChange={(e) =>
                        handleEditField("employeeSignature", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Manager Status</FieldLabel>
                    <SelectInput
                      value={editData.managerStatus}
                      onChange={(e) =>
                        handleEditField("managerStatus", e.target.value)
                      }
                    >
                      <option value="submitted">Submitted</option>
                      <option value="received">Received</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="accepted">Accepted</option>
                      <option value="closed">Closed</option>
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Follow Up By</FieldLabel>
                    <TextInput
                      value={editData.followUpByName}
                      onChange={(e) =>
                        handleEditField("followUpByName", e.target.value)
                      }
                      placeholder="Duty Manager name"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Manager Comments</FieldLabel>
                  <TextArea
                    value={editData.managerComments}
                    onChange={(e) =>
                      handleEditField("managerComments", e.target.value)
                    }
                    placeholder="Comments visible to the supervisor about this report."
                  />
                </div>

                <div>
                  <FieldLabel>Items</FieldLabel>
                  <TextArea
                    value={editData.items}
                    onChange={(e) => handleEditField("items", e.target.value)}
                  />
                </div>

                <div>
                  <FieldLabel>Picture Notes</FieldLabel>
                  <TextArea
                    value={editData.pictureNotes}
                    onChange={(e) =>
                      handleEditField("pictureNotes", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Receipt Notes</FieldLabel>
                  <TextArea
                    value={editData.receiptNotes}
                    onChange={(e) =>
                      handleEditField("receiptNotes", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Reason</FieldLabel>
                  <TextArea
                    value={editData.reason}
                    onChange={(e) => handleEditField("reason", e.target.value)}
                  />
                </div>
              </div>
            )}
          </PageCard>
        )}
      </div>
    </div>
  );
}
