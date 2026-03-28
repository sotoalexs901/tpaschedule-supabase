// src/pages/MyWCHRReports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import jsPDF from "jspdf";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatMMDDYYYYFromFirestore(val) {
  try {
    const d =
      val?.toDate?.() instanceof Date
        ? val.toDate()
        : val instanceof Date
        ? val
        : new Date(val);

    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
  } catch {
    return "";
  }
}

function toInputDateValue(val) {
  try {
    const d =
      val?.toDate?.() instanceof Date
        ? val.toDate()
        : val instanceof Date
        ? val
        : new Date(val);

    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch {
    return "";
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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
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
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
      boxShadow: "none",
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
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
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

function statusBadge(status) {
  const s = String(status || "").toUpperCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (s === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (s === "NEW") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function groupReports(rows) {
  const grouped = {};

  rows.forEach((r) => {
    const dateKey = formatMMDDYYYYFromFirestore(r.flight_date) || "No Date";
    const flightKey = `${r.airline || "—"} ${r.flight_number || "—"}`.trim();

    if (!grouped[dateKey]) grouped[dateKey] = {};
    if (!grouped[dateKey][flightKey]) grouped[dateKey][flightKey] = [];
    grouped[dateKey][flightKey].push(r);
  });

  return grouped;
}

async function imageToDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function MyWCHRReports() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const employeeId = useMemo(() => user?.id || "", [user]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setError("");
      setLoading(true);

      try {
        if (!employeeId) {
          setRows([]);
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, "wch_reports"),
          where("employee_id", "==", employeeId),
          orderBy("submitted_at", "desc"),
          limit(100)
        );

        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (mounted) setRows(data);
      } catch (e) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load reports.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [employeeId]);

  const groupedReports = useMemo(() => groupReports(rows), [rows]);

  const totalReports = rows.length;

  const handleDelete = async (id) => {
    const ok = window.confirm(
      "Delete this WCHR report? This action cannot be undone."
    );
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteDoc(doc(db, "wch_reports", id));
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMessage("Report deleted successfully.");
    } catch (e) {
      console.error(e);
      setError("Error deleting report.");
    } finally {
      setDeletingId("");
    }
  };

  const handleOpenEdit = (row) => {
    setEditingRow({
      ...row,
      flight_date: toInputDateValue(row.flight_date),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRow?.id) return;

    try {
      setSavingEdit(true);

      await updateDoc(doc(db, "wch_reports", editingRow.id), {
        passenger_name: editingRow.passenger_name || "",
        airline: editingRow.airline || "",
        flight_number: editingRow.flight_number || "",
        flight_date: editingRow.flight_date
          ? new Date(`${editingRow.flight_date}T00:00:00`)
          : null,
        origin: editingRow.origin || "",
        destination: editingRow.destination || "",
        seat: editingRow.seat || "",
        gate: editingRow.gate || "",
        pnr: editingRow.pnr || "",
        wch_type: editingRow.wch_type || "",
        time_at_gate: editingRow.time_at_gate || "",
        boarding_group: editingRow.boarding_group || "",
        operator: editingRow.operator || "",
      });

      setRows((prev) =>
        prev.map((r) =>
          r.id === editingRow.id
            ? {
                ...r,
                ...editingRow,
                flight_date: editingRow.flight_date
                  ? new Date(`${editingRow.flight_date}T00:00:00`)
                  : r.flight_date,
              }
            : r
        )
      );

      setEditingRow(null);
      setMessage("Report updated successfully.");
    } catch (e) {
      console.error(e);
      setError("Error updating report.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePrint = (row) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>WCHR Report ${row.report_id || row.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin-bottom: 8px; }
            .meta { margin-bottom: 16px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .box { border: 1px solid #dbeafe; border-radius: 10px; padding: 12px; }
            .label { font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
            img { max-width: 320px; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 18px; }
          </style>
        </head>
        <body>
          <h1>WCHR Report</h1>
          <div class="meta">
            <strong>Report ID:</strong> ${row.report_id || row.id}<br/>
            <strong>Status:</strong> ${row.status || "-"}
          </div>
          <div class="grid">
            <div class="box"><div class="label">Passenger</div>${row.passenger_name || "-"}</div>
            <div class="box"><div class="label">Flight</div>${row.airline || "-"} ${row.flight_number || ""}</div>
            <div class="box"><div class="label">Date</div>${formatMMDDYYYYFromFirestore(row.flight_date) || "-"}</div>
            <div class="box"><div class="label">WCHR Type</div>${row.wch_type || "-"}</div>
            <div class="box"><div class="label">Origin</div>${row.origin || "-"}</div>
            <div class="box"><div class="label">Destination</div>${row.destination || "-"}</div>
            <div class="box"><div class="label">Seat</div>${row.seat || "-"}</div>
            <div class="box"><div class="label">Gate</div>${row.gate || "-"}</div>
            <div class="box"><div class="label">PNR</div>${row.pnr || "-"}</div>
            <div class="box"><div class="label">Operator</div>${row.operator || "-"}</div>
          </div>
          ${
            row.image_url
              ? `<div><img src="${row.image_url}" alt="Boarding Pass"/></div>`
              : ""
          }
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportPdf = async (row) => {
    try {
      const pdf = new jsPDF("portrait", "pt", "letter");
      let y = 40;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("WCHR Report", 40, y);
      y += 24;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);

      const lines = [
        `Report ID: ${row.report_id || row.id}`,
        `Status: ${row.status || "-"}`,
        `Passenger: ${row.passenger_name || "-"}`,
        `Flight: ${(row.airline || "-") + " " + (row.flight_number || "")}`,
        `Date: ${formatMMDDYYYYFromFirestore(row.flight_date) || "-"}`,
        `WCHR Type: ${row.wch_type || "-"}`,
        `Origin: ${row.origin || "-"}`,
        `Destination: ${row.destination || "-"}`,
        `Seat: ${row.seat || "-"}`,
        `Gate: ${row.gate || "-"}`,
        `PNR: ${row.pnr || "-"}`,
        `Operator: ${row.operator || "-"}`,
        `Time at Gate: ${row.time_at_gate || "-"}`,
        `Boarding Group: ${row.boarding_group || "-"}`,
      ];

      lines.forEach((line) => {
        pdf.text(line, 40, y);
        y += 16;
      });

      if (row.image_url) {
        try {
          const dataUrl = await imageToDataUrl(row.image_url);
          y += 10;
          pdf.addImage(dataUrl, "JPEG", 40, y, 240, 180);
        } catch (imgErr) {
          console.warn("Could not attach image to PDF:", imgErr);
        }
      }

      pdf.save(`${row.report_id || row.id}.pdf`);
    } catch (e) {
      console.error(e);
      setError("Error exporting PDF.");
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
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
            gap: 16,
            alignItems: "flex-start",
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
              TPA OPS · WCHR
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
              My WCHR Reports
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review, edit, print, export and manage your boarding pass scan reports.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton onClick={() => navigate("/wchr/scan")} variant="primary">
              + New Report
            </ActionButton>
            <ActionButton onClick={() => navigate("/dashboard")} variant="secondary">
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error ? "#fff1f2" : "#ecfdf5",
              border: `1px solid ${error ? "#fecdd3" : "#a7f3d0"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error ? "#9f1239" : "#065f46",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Total Reports
            </p>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {totalReports}
            </p>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Reports by Date & Flight
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Reports are grouped by flight date and flight number.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={infoBoxStyle}>
            No reports yet. Click <b>New Report</b> to submit one.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {Object.entries(groupedReports).map(([dateKey, flights]) => (
              <div key={dateKey} style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    background: "#edf7ff",
                    border: "1px solid #cfe7fb",
                    color: "#1769aa",
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  Date: {dateKey}
                </div>

                {Object.entries(flights).map(([flightKey, reports]) => (
                  <div
                    key={flightKey}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 18,
                      padding: 16,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 16,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      Flight: {flightKey}
                    </div>

                    <div style={{ display: "grid", gap: 14 }}>
                      {reports.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            border: "1px solid #eef2f7",
                            borderRadius: 16,
                            padding: 14,
                            background: "#fbfdff",
                            display: "grid",
                            gridTemplateColumns: "110px 1fr",
                            gap: 14,
                          }}
                        >
                          <div>
                            {r.image_url ? (
                              <img
                                src={r.image_url}
                                alt="Boarding pass"
                                style={{
                                  width: 100,
                                  height: 130,
                                  objectFit: "cover",
                                  borderRadius: 12,
                                  border: "1px solid #dbeafe",
                                  background: "#fff",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 100,
                                  height: 130,
                                  borderRadius: 12,
                                  border: "1px solid #dbeafe",
                                  background: "#f8fbff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#94a3b8",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textAlign: "center",
                                  padding: 8,
                                }}
                              >
                                No image
                              </div>
                            )}
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 800,
                                    color: "#0f172a",
                                  }}
                                >
                                  {r.passenger_name || "No passenger"}
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 12,
                                    color: "#64748b",
                                  }}
                                >
                                  Report ID: {r.report_id || r.id}
                                </div>
                              </div>

                              <span style={statusBadge(r.status)}>
                                {r.status || "—"}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(140px, 1fr))",
                                gap: 10,
                                marginTop: 12,
                              }}
                            >
                              <InfoMini label="Flight" value={`${r.airline || "—"} ${r.flight_number || ""}`} />
                              <InfoMini label="Date" value={formatMMDDYYYYFromFirestore(r.flight_date) || "—"} />
                              <InfoMini label="Seat" value={r.seat || "—"} />
                              <InfoMini label="Gate" value={r.gate || "—"} />
                              <InfoMini label="PNR" value={r.pnr || "—"} />
                              <InfoMini label="WCHR Type" value={r.wch_type || "—"} />
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                                marginTop: 14,
                              }}
                            >
                              <ActionButton
                                variant="secondary"
                                onClick={() => handleOpenEdit(r)}
                              >
                                Edit
                              </ActionButton>

                              <ActionButton
                                variant="success"
                                onClick={() => handleExportPdf(r)}
                              >
                                Export PDF
                              </ActionButton>

                              <ActionButton
                                variant="warning"
                                onClick={() => handlePrint(r)}
                              >
                                Print
                              </ActionButton>

                              <ActionButton
                                variant="danger"
                                onClick={() => handleDelete(r.id)}
                                disabled={deletingId === r.id}
                              >
                                {deletingId === r.id ? "Deleting..." : "Delete"}
                              </ActionButton>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {editingRow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 22,
              padding: 20,
              boxShadow: "0 24px 60px rgba(15,23,42,0.20)",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Edit WCHR Report
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <EditField
                label="Passenger Name"
                value={editingRow.passenger_name || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, passenger_name: v }))
                }
              />
              <EditField
                label="Airline"
                value={editingRow.airline || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, airline: v }))
                }
              />
              <EditField
                label="Flight Number"
                value={editingRow.flight_number || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, flight_number: v }))
                }
              />
              <EditField
                label="Flight Date"
                type="date"
                value={editingRow.flight_date || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, flight_date: v }))
                }
              />
              <EditField
                label="Origin"
                value={editingRow.origin || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, origin: v }))
                }
              />
              <EditField
                label="Destination"
                value={editingRow.destination || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, destination: v }))
                }
              />
              <EditField
                label="Seat"
                value={editingRow.seat || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, seat: v }))
                }
              />
              <EditField
                label="Gate"
                value={editingRow.gate || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, gate: v }))
                }
              />
              <EditField
                label="PNR"
                value={editingRow.pnr || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, pnr: v }))
                }
              />
              <EditField
                label="WCHR Type"
                value={editingRow.wch_type || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, wch_type: v }))
                }
              />
              <EditField
                label="Time at Gate"
                value={editingRow.time_at_gate || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, time_at_gate: v }))
                }
              />
              <EditField
                label="Boarding Group"
                value={editingRow.boarding_group || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, boarding_group: v }))
                }
              />
              <EditField
                label="Operator"
                value={editingRow.operator || ""}
                onChange={(v) =>
                  setEditingRow((prev) => ({ ...prev, operator: v }))
                }
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <ActionButton
                variant="success"
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </ActionButton>

              <ActionButton
                variant="secondary"
                onClick={() => setEditingRow(null)}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoMini({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>
      <TextInput
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const infoBoxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
};
