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
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

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

function TextArea(props) {
  return (
    <textarea
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
        resize: "vertical",
        minHeight: 110,
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

function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
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
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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
      type={type}
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

function DetailRow({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#0f172a",
          fontWeight: 700,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function YesNoBadge({ value }) {
  const normalized = String(value || "").trim().toLowerCase();
  const isYes = normalized === "yes";
  const isNo = normalized === "no";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: isYes ? "#ecfdf5" : isNo ? "#fff1f2" : "#f8fafc",
        color: isYes ? "#065f46" : isNo ? "#9f1239" : "#334155",
        border: `1px solid ${isYes ? "#a7f3d0" : isNo ? "#fecdd3" : "#e2e8f0"}`,
      }}
    >
      {value || "—"}
    </span>
  );
}

function normalizeReportForEdit(report) {
  return {
    fecha: report?.fecha || "",
    horaIn: report?.horaIn || "",
    horaTerminacion: report?.horaTerminacion || "",
    airline: report?.airline || "",
    flightNo: report?.flightNo || "",
    tailNo: report?.tailNo || "",
    supervisorName: report?.supervisorName || "",
    supervisorPosition: report?.supervisorPosition || "",
    airlineRep: report?.airlineRep || "",
    verifiedByAirlineRep: report?.verifiedByAirlineRep || "",
    supervisorSignature: report?.supervisorSignature || "",
    airlineRepSignature: report?.airlineRepSignature || "",
    limpiezaObservaciones: report?.limpiezaObservaciones || "",
    securityObservaciones: report?.securityObservaciones || "",
    suspiciousItemDetails: report?.suspiciousItemDetails || "",
    attachmentsNotes: report?.attachmentsNotes || "",

    distribution: {
      galleyLav: report?.distribution?.galleyLav || "",
      left1to11: report?.distribution?.left1to11 || "",
      right1to11: report?.distribution?.right1to11 || "",
      left12to21: report?.distribution?.left12to21 || "",
      right12to21: report?.distribution?.right12to21 || "",
      left22to31: report?.distribution?.left22to31 || "",
      right22to31: report?.distribution?.right22to31 || "",
      vacuum: report?.distribution?.vacuum || "",
    },

    limpieza: {
      basuraRemovida: report?.limpieza?.basuraRemovida || "",
      bolsillosOrganizados: report?.limpieza?.bolsillosOrganizados || "",
      bandejasLimpias: report?.limpieza?.bandejasLimpias || "",
      alfombraAspirada: report?.limpieza?.alfombraAspirada || "",
      lavRevisados: report?.limpieza?.lavRevisados || "",
      galleyLimpios: report?.limpieza?.galleyLimpios || "",
      suministrosBanos: report?.limpieza?.suministrosBanos || "",
    },

    security: {
      debajoAsientos: report?.security?.debajoAsientos || "",
      bolsillosVerificados: report?.security?.bolsillosVerificados || "",
      jumpSeats: report?.security?.jumpSeats || "",
      lavabos: report?.security?.lavabos || "",
      armarios: report?.security?.armarios || "",
      compartimientosEmergencia: report?.security?.compartimientosEmergencia || "",
      espaldarAsientos: report?.security?.espaldarAsientos || "",
      compartimientosSuperiores:
        report?.security?.compartimientosSuperiores || "",
    },

    finalConfirmation: {
      limpiezaCompletada:
        report?.finalConfirmation?.limpiezaCompletada || "",
      securityCompletado:
        report?.finalConfirmation?.securityCompletado || "",
      articuloSospechoso:
        report?.finalConfirmation?.articuloSospechoso || "",
    },
  };
}

export default function CleaningSecurityReportsAdminPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [filters, setFilters] = useState({
    airline: "all",
    date: "",
    supervisor: "",
  });

  const [editData, setEditData] = useState(normalizeReportForEdit(null));

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  useEffect(() => {
    async function loadData() {
      try {
        const qReports = query(
          collection(db, "cleaning_security_reports"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(qReports);
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(items);
      } catch (err) {
        console.error("Error loading cleaning/security reports:", err);
        setStatusMessage("Could not load reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const airlineOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((item) => {
      if (item.airline) set.add(String(item.airline).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (
        filters.airline !== "all" &&
        String(item.airline || "").trim() !== filters.airline
      ) {
        return false;
      }

      if (filters.date && String(item.fecha || "") !== filters.date) {
        return false;
      }

      if (
        filters.supervisor &&
        !String(item.supervisorName || "")
          .toLowerCase()
          .includes(filters.supervisor.toLowerCase())
      ) {
        return false;
      }

      return String(item.status || "").toLowerCase() !== "archived";
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((item) => item.id === selectedId) || null;
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (selectedId && !filteredReports.some((r) => r.id === selectedId)) {
      setSelectedId(filteredReports[0]?.id || "");
    }
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedReport) {
      setEditData(normalizeReportForEdit(null));
      setIsEditMode(false);
      return;
    }
    setEditData(normalizeReportForEdit(selectedReport));
  }, [selectedReport]);

  const handleEditField = (field, value) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNestedField = (group, field, value) => {
    setEditData((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveEdits = async () => {
    if (!selectedReport) return;

    try {
      setSavingId(selectedReport.id);

      const payload = {
        ...editData,
        lastEditedAt: serverTimestamp(),
        lastEditedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
        lastEditedByRole: user?.role || "",
      };

      await updateDoc(doc(db, "cleaning_security_reports", selectedReport.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                ...editData,
                lastEditedAt: new Date(),
                lastEditedByName:
                  user?.displayName ||
                  user?.fullName ||
                  user?.name ||
                  user?.username ||
                  "Manager",
                lastEditedByRole: user?.role || "",
              }
            : item
        )
      );

      setStatusMessage("Report updated successfully.");
      setIsEditMode(false);
    } catch (err) {
      console.error("Error saving report edits:", err);
      setStatusMessage("Could not save report changes.");
    } finally {
      setSavingId("");
    }
  };

  const handleArchive = async () => {
    if (!selectedReport) return;

    const ok = window.confirm("Archive this report?");
    if (!ok) return;

    try {
      setArchivingId(selectedReport.id);

      await updateDoc(doc(db, "cleaning_security_reports", selectedReport.id), {
        status: "archived",
        archivedAt: serverTimestamp(),
        archivedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
        archivedByRole: user?.role || "",
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                status: "archived",
                archivedAt: new Date(),
                archivedByName:
                  user?.displayName ||
                  user?.fullName ||
                  user?.name ||
                  user?.username ||
                  "Manager",
                archivedByRole: user?.role || "",
              }
            : item
        )
      );

      setStatusMessage("Report archived.");
    } catch (err) {
      console.error("Error archiving report:", err);
      setStatusMessage("Could not archive report.");
    } finally {
      setArchivingId("");
    }
  };

  const handleDelete = async () => {
    if (!selectedReport) return;

    const ok = window.confirm(
      "Delete this report permanently? This cannot be undone."
    );
    if (!ok) return;

    try {
      setDeletingId(selectedReport.id);
      await deleteDoc(doc(db, "cleaning_security_reports", selectedReport.id));
      setReports((prev) => prev.filter((item) => item.id !== selectedReport.id));
      setStatusMessage("Report deleted.");
    } catch (err) {
      console.error("Error deleting report:", err);
      setStatusMessage("Could not delete report.");
    } finally {
      setDeletingId("");
    }
  };

  const exportPDF = () => {
    if (!selectedReport) return;

    try {
      const pdf = new jsPDF("p", "pt", "letter");
      const marginX = 40;
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 40;

      const lineGap = 14;

      const addLine = (label, value) => {
        const text = `${label}: ${value || "—"}`;
        const lines = pdf.splitTextToSize(text, pageWidth - marginX * 2);

        lines.forEach((line) => {
          if (y > pageHeight - 40) {
            pdf.addPage();
            y = 40;
          }
          pdf.text(line, marginX, y);
          y += lineGap;
        });
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Cleaning and Security Search Report", marginX, y);
      y += 24;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      addLine("Date", selectedReport.fecha);
      addLine("Hora In", selectedReport.horaIn);
      addLine("Hora Terminacion", selectedReport.horaTerminacion);
      addLine("Airline", selectedReport.airline);
      addLine("Flight No", selectedReport.flightNo);
      addLine("Tail No", selectedReport.tailNo);
      addLine("Supervisor", selectedReport.supervisorName);
      addLine("Supervisor Position", selectedReport.supervisorPosition);
      addLine("Airline Representative", selectedReport.airlineRep);
      addLine("Verified by Airline Rep", selectedReport.verifiedByAirlineRep);
      addLine("Supervisor Signature", selectedReport.supervisorSignature);
      addLine("Airline Rep Signature", selectedReport.airlineRepSignature);

      y += 8;
      pdf.setFont("helvetica", "bold");
      pdf.text("Work Distribution", marginX, y);
      y += 18;
      pdf.setFont("helvetica", "normal");

      Object.entries(selectedReport.distribution || {}).forEach(([key, value]) => {
        addLine(key, value);
      });

      y += 8;
      pdf.setFont("helvetica", "bold");
      pdf.text("Cleaning Checklist", marginX, y);
      y += 18;
      pdf.setFont("helvetica", "normal");

      Object.entries(selectedReport.limpieza || {}).forEach(([key, value]) => {
        addLine(key, value);
      });
      addLine("Cleaning Observations", selectedReport.limpiezaObservaciones);

      y += 8;
      pdf.setFont("helvetica", "bold");
      pdf.text("Security Search Checklist", marginX, y);
      y += 18;
      pdf.setFont("helvetica", "normal");

      Object.entries(selectedReport.security || {}).forEach(([key, value]) => {
        addLine(key, value);
      });
      addLine("Security Observations", selectedReport.securityObservaciones);

      y += 8;
      pdf.setFont("helvetica", "bold");
      pdf.text("Final Confirmation", marginX, y);
      y += 18;
      pdf.setFont("helvetica", "normal");

      Object.entries(selectedReport.finalConfirmation || {}).forEach(([key, value]) => {
        addLine(key, value);
      });
      addLine("Suspicious Item Details", selectedReport.suspiciousItemDetails);
      addLine("Attachment Notes", selectedReport.attachmentsNotes);

      if (Array.isArray(selectedReport.photos) && selectedReport.photos.length > 0) {
        y += 8;
        pdf.setFont("helvetica", "bold");
        pdf.text("Photos", marginX, y);
        y += 18;
        pdf.setFont("helvetica", "normal");

        selectedReport.photos.forEach((photo, index) => {
          addLine(`Photo ${index + 1}`, photo?.url || photo?.name || "—");
        });
      }

      const safeAirline = String(selectedReport.airline || "Airline")
        .replace(/\s+/g, "_")
        .replace(/[^\w-]/g, "");
      const safeFlight = String(selectedReport.flightNo || "Flight")
        .replace(/\s+/g, "_")
        .replace(/[^\w-]/g, "");

      pdf.save(`CleaningSecurity_${safeAirline}_${safeFlight}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      setStatusMessage("Could not export PDF.");
    }
  };

  if (!canAccess) {
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
            TPA OPS · Reports
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
            Only Duty Managers and Station Managers can view these reports.
          </p>
        </div>
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

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
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
              TPA OPS · Reports Admin
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
              Cleaning and Security Search Reports
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review, edit, archive, export and manage submitted reports.
            </p>
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </ActionButton>
        </div>
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
            Filters
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All</option>
              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={filters.date}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, date: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>Supervisor</FieldLabel>
            <TextInput
              value={filters.supervisor}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, supervisor: e.target.value }))
              }
              placeholder="Search by supervisor name"
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
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Submitted Reports
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Loading reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              No reports found.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => {
                    setSelectedId(report.id);
                    setIsEditMode(false);
                  }}
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    cursor: "pointer",
                    background:
                      report.id === selectedId ? "#edf7ff" : "#ffffff",
                    border:
                      report.id === selectedId
                        ? "1px solid #bfe0fb"
                        : "1px solid #e2e8f0",
                    boxShadow:
                      report.id === selectedId
                        ? "0 10px 22px rgba(23,105,170,0.10)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {report.airline || "—"} · {report.flightNo || "—"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    {report.fecha || "—"} · Tail {report.tailNo || "—"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "#1769aa",
                      fontWeight: 700,
                    }}
                  >
                    Supervisor: {report.supervisorName || "—"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    Submitted: {formatDateTime(report.createdAt)}
                  </div>
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
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Report Detail
                    </h2>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.airline || "—"} · Flight {selectedReport.flightNo || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton variant="secondary" onClick={exportPDF}>
                      Export PDF
                    </ActionButton>

                    <ActionButton
                      variant="primary"
                      onClick={() => setIsEditMode(true)}
                    >
                      Edit
                    </ActionButton>

                    <ActionButton
                      variant="warning"
                      onClick={handleArchive}
                      disabled={archivingId === selectedReport.id}
                    >
                      {archivingId === selectedReport.id ? "Archiving..." : "Archive"}
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={handleDelete}
                      disabled={deletingId === selectedReport.id}
                    >
                      {deletingId === selectedReport.id ? "Deleting..." : "Delete"}
                    </ActionButton>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <DetailRow label="Date" value={selectedReport.fecha} />
                  <DetailRow label="Hora In" value={selectedReport.horaIn} />
                  <DetailRow
                    label="Hora Terminación"
                    value={selectedReport.horaTerminacion}
                  />
                  <DetailRow label="Airline" value={selectedReport.airline} />
                  <DetailRow label="Flight No" value={selectedReport.flightNo} />
                  <DetailRow label="Tail No" value={selectedReport.tailNo} />
                  <DetailRow
                    label="Supervisor"
                    value={selectedReport.supervisorName}
                  />
                  <DetailRow
                    label="Supervisor Position"
                    value={selectedReport.supervisorPosition}
                  />
                  <DetailRow
                    label="Airline Representative"
                    value={selectedReport.airlineRep}
                  />
                  <DetailRow
                    label="Verified by Airline Rep"
                    value={selectedReport.verifiedByAirlineRep}
                  />
                  <DetailRow
                    label="Supervisor Signature"
                    value={selectedReport.supervisorSignature}
                  />
                  <DetailRow
                    label="Airline Rep Signature"
                    value={selectedReport.airlineRepSignature}
                  />
                </div>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Work Distribution
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailRow label="Galley & Lav" value={selectedReport.distribution?.galleyLav} />
                    <DetailRow label="Left Row 1 to 11" value={selectedReport.distribution?.left1to11} />
                    <DetailRow label="Right Row 1 to 11" value={selectedReport.distribution?.right1to11} />
                    <DetailRow label="Left Row 12 to 21" value={selectedReport.distribution?.left12to21} />
                    <DetailRow label="Right Row 12 to 21" value={selectedReport.distribution?.right12to21} />
                    <DetailRow label="Left Row 22 to 31" value={selectedReport.distribution?.left22to31} />
                    <DetailRow label="Right Row 22 to 31" value={selectedReport.distribution?.right22to31} />
                    <DetailRow label="Vacuum" value={selectedReport.distribution?.vacuum} />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Cleaning Checklist
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div><FieldLabel>Trash removed</FieldLabel><YesNoBadge value={selectedReport.limpieza?.basuraRemovida} /></div>
                    <div><FieldLabel>Seat pockets organized</FieldLabel><YesNoBadge value={selectedReport.limpieza?.bolsillosOrganizados} /></div>
                    <div><FieldLabel>Tray tables cleaned</FieldLabel><YesNoBadge value={selectedReport.limpieza?.bandejasLimpias} /></div>
                    <div><FieldLabel>Carpet vacuumed</FieldLabel><YesNoBadge value={selectedReport.limpieza?.alfombraAspirada} /></div>
                    <div><FieldLabel>Lavatories checked</FieldLabel><YesNoBadge value={selectedReport.limpieza?.lavRevisados} /></div>
                    <div><FieldLabel>Galley cleaned</FieldLabel><YesNoBadge value={selectedReport.limpieza?.galleyLimpios} /></div>
                    <div><FieldLabel>Lav supplies replenished</FieldLabel><YesNoBadge value={selectedReport.limpieza?.suministrosBanos} /></div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <DetailRow
                      label="Cleaning observations"
                      value={selectedReport.limpiezaObservaciones}
                    />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Security Search Checklist
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div><FieldLabel>Under seats checked</FieldLabel><YesNoBadge value={selectedReport.security?.debajoAsientos} /></div>
                    <div><FieldLabel>Seat pockets verified</FieldLabel><YesNoBadge value={selectedReport.security?.bolsillosVerificados} /></div>
                    <div><FieldLabel>Jump seats inspected</FieldLabel><YesNoBadge value={selectedReport.security?.jumpSeats} /></div>
                    <div><FieldLabel>Lavatories inspected</FieldLabel><YesNoBadge value={selectedReport.security?.lavabos} /></div>
                    <div><FieldLabel>Closets verified</FieldLabel><YesNoBadge value={selectedReport.security?.armarios} /></div>
                    <div><FieldLabel>Emergency compartments checked</FieldLabel><YesNoBadge value={selectedReport.security?.compartimientosEmergencia} /></div>
                    <div><FieldLabel>Seat backs checked</FieldLabel><YesNoBadge value={selectedReport.security?.espaldarAsientos} /></div>
                    <div><FieldLabel>Overhead bins checked</FieldLabel><YesNoBadge value={selectedReport.security?.compartimientosSuperiores} /></div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <DetailRow
                      label="Security observations"
                      value={selectedReport.securityObservaciones}
                    />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Final Confirmation
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div><FieldLabel>Cleaning completed</FieldLabel><YesNoBadge value={selectedReport.finalConfirmation?.limpiezaCompletada} /></div>
                    <div><FieldLabel>Security completed</FieldLabel><YesNoBadge value={selectedReport.finalConfirmation?.securityCompletado} /></div>
                    <div><FieldLabel>Suspicious item found</FieldLabel><YesNoBadge value={selectedReport.finalConfirmation?.articuloSospechoso} /></div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <DetailRow
                      label="Suspicious item details"
                      value={selectedReport.suspiciousItemDetails}
                    />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Photos
                  </h3>

                  {Array.isArray(selectedReport.photos) && selectedReport.photos.length > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {selectedReport.photos.map((photo, index) => (
                        <a
                          key={`${photo.url}-${index}`}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block",
                            textDecoration: "none",
                            border: "1px solid #dbeafe",
                            borderRadius: 16,
                            overflow: "hidden",
                            background: "#fff",
                          }}
                        >
                          <img
                            src={photo.url}
                            alt={photo.name || `Photo ${index + 1}`}
                            style={{
                              width: "100%",
                              height: 180,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                          <div
                            style={{
                              padding: 10,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#334155",
                              wordBreak: "break-word",
                            }}
                          >
                            {photo.name || `Photo ${index + 1}`}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      No photos attached.
                    </div>
                  )}
                </PageCard>

                <DetailRow
                  label="Attachment notes"
                  value={selectedReport.attachmentsNotes}
                />

                <DetailRow
                  label="Submitted at"
                  value={formatDateTime(selectedReport.createdAt)}
                />
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
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Edit Report
                    </h2>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.airline || "—"} · Flight {selectedReport.flightNo || "—"}
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
                      variant="primary"
                      onClick={handleSaveEdits}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Save Changes"}
                    </ActionButton>
                  </div>
                </div>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <FieldLabel>Date</FieldLabel>
                      <TextInput
                        type="date"
                        value={editData.fecha}
                        onChange={(e) => handleEditField("fecha", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Hora In</FieldLabel>
                      <TextInput
                        value={editData.horaIn}
                        onChange={(e) => handleEditField("horaIn", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Hora Terminación</FieldLabel>
                      <TextInput
                        value={editData.horaTerminacion}
                        onChange={(e) =>
                          handleEditField("horaTerminacion", e.target.value)
                        }
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
                      <FieldLabel>Flight No</FieldLabel>
                      <TextInput
                        value={editData.flightNo}
                        onChange={(e) => handleEditField("flightNo", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Tail No</FieldLabel>
                      <TextInput
                        value={editData.tailNo}
                        onChange={(e) => handleEditField("tailNo", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Supervisor Name</FieldLabel>
                      <TextInput
                        value={editData.supervisorName}
                        onChange={(e) =>
                          handleEditField("supervisorName", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Supervisor Position</FieldLabel>
                      <TextInput
                        value={editData.supervisorPosition}
                        onChange={(e) =>
                          handleEditField("supervisorPosition", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Airline Representative</FieldLabel>
                      <TextInput
                        value={editData.airlineRep}
                        onChange={(e) => handleEditField("airlineRep", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Verified by Airline Rep</FieldLabel>
                      <TextInput
                        value={editData.verifiedByAirlineRep}
                        onChange={(e) =>
                          handleEditField("verifiedByAirlineRep", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Supervisor Signature</FieldLabel>
                      <TextInput
                        value={editData.supervisorSignature}
                        onChange={(e) =>
                          handleEditField("supervisorSignature", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Airline Rep Signature</FieldLabel>
                      <TextInput
                        value={editData.airlineRepSignature}
                        onChange={(e) =>
                          handleEditField("airlineRepSignature", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Work Distribution
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {Object.keys(editData.distribution || {}).map((key) => (
                      <div key={key}>
                        <FieldLabel>{key}</FieldLabel>
                        <TextInput
                          value={editData.distribution[key]}
                          onChange={(e) =>
                            handleNestedField("distribution", key, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Cleaning Checklist
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {Object.keys(editData.limpieza || {}).map((key) => (
                      <div key={key}>
                        <FieldLabel>{key}</FieldLabel>
                        <SelectInput
                          value={editData.limpieza[key]}
                          onChange={(e) =>
                            handleNestedField("limpieza", key, e.target.value)
                          }
                        >
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </SelectInput>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <FieldLabel>Cleaning observations</FieldLabel>
                    <TextArea
                      value={editData.limpiezaObservaciones}
                      onChange={(e) =>
                        handleEditField("limpiezaObservaciones", e.target.value)
                      }
                    />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Security Search Checklist
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {Object.keys(editData.security || {}).map((key) => (
                      <div key={key}>
                        <FieldLabel>{key}</FieldLabel>
                        <SelectInput
                          value={editData.security[key]}
                          onChange={(e) =>
                            handleNestedField("security", key, e.target.value)
                          }
                        >
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </SelectInput>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <FieldLabel>Security observations</FieldLabel>
                    <TextArea
                      value={editData.securityObservaciones}
                      onChange={(e) =>
                        handleEditField("securityObservaciones", e.target.value)
                      }
                    />
                  </div>
                </PageCard>

                <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    Final Confirmation
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {Object.keys(editData.finalConfirmation || {}).map((key) => (
                      <div key={key}>
                        <FieldLabel>{key}</FieldLabel>
                        <SelectInput
                          value={editData.finalConfirmation[key]}
                          onChange={(e) =>
                            handleNestedField("finalConfirmation", key, e.target.value)
                          }
                        >
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </SelectInput>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <FieldLabel>Suspicious item details</FieldLabel>
                    <TextArea
                      value={editData.suspiciousItemDetails}
                      onChange={(e) =>
                        handleEditField("suspiciousItemDetails", e.target.value)
                      }
                    />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <FieldLabel>Attachment notes</FieldLabel>
                    <TextArea
                      value={editData.attachmentsNotes}
                      onChange={(e) =>
                        handleEditField("attachmentsNotes", e.target.value)
                      }
                    />
                  </div>
                </PageCard>
              </div>
            )}
          </PageCard>
        )}
      </div>
    </div>
  );
}
