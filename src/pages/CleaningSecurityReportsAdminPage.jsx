import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

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
  };

  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
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

export default function CleaningSecurityReportsAdminPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [filters, setFilters] = useState({
    airline: "all",
    date: "",
    supervisor: "",
  });

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

      return true;
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
              Review all submitted supervisor reports, photos, signatures and checklist details.
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
            <div
              style={{
                display: "grid",
                gap: 10,
              }}
            >
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedId(report.id)}
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
            <div style={{ display: "grid", gap: 16 }}>
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
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Work Distribution
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <DetailRow
                    label="Galley & Lav"
                    value={selectedReport.distribution?.galleyLav}
                  />
                  <DetailRow
                    label="Left Row 1 to 11"
                    value={selectedReport.distribution?.left1to11}
                  />
                  <DetailRow
                    label="Right Row 1 to 11"
                    value={selectedReport.distribution?.right1to11}
                  />
                  <DetailRow
                    label="Left Row 12 to 21"
                    value={selectedReport.distribution?.left12to21}
                  />
                  <DetailRow
                    label="Right Row 12 to 21"
                    value={selectedReport.distribution?.right12to21}
                  />
                  <DetailRow
                    label="Left Row 22 to 31"
                    value={selectedReport.distribution?.left22to31}
                  />
                  <DetailRow
                    label="Right Row 22 to 31"
                    value={selectedReport.distribution?.right22to31}
                  />
                  <DetailRow
                    label="Vacuum"
                    value={selectedReport.distribution?.vacuum}
                  />
                </div>
              </PageCard>

              <PageCard style={{ padding: 18, background: "#fcfdff" }}>
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
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
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
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
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
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
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
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
          </PageCard>
        )}
      </div>
    </div>
  );
}
