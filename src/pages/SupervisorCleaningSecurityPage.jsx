import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const AIRLINE_OPTIONS = [
  "Aeromexico",
  "Delta Airline",
  "Avianca",
  "WestJet",
  "World Atlantic",
  "Sun Country",
  "Other",
];

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        width: "100%",
        maxWidth: "100%",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
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
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
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
      boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
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
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
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

function YesNoField({ label, value, onChange }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </SelectInput>
    </div>
  );
}

function SignatureBox({
  label,
  value,
  onChange,
  placeholder = "Type full name as signature",
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontFamily: "cursive",
          fontSize: 17,
          fontWeight: 700,
          minHeight: 46,
        }}
      />
    </div>
  );
}

function emptyDistribution() {
  return {
    galleyLav: "",
    left1to11: "",
    right1to11: "",
    left12to21: "",
    right12to21: "",
    left22to31: "",
    right22to31: "",
    vacuum: "",
  };
}

function initialCleaningChecklist() {
  return {
    basuraRemovida: "",
    bolsillosOrganizados: "",
    bandejasLimpias: "",
    alfombraAspirada: "",
    lavRevisados: "",
    galleyLimpios: "",
    suministrosBanos: "",
  };
}

function initialSecurityChecklist() {
  return {
    debajoAsientos: "",
    bolsillosVerificados: "",
    jumpSeats: "",
    lavabos: "",
    armarios: "",
    compartimientosEmergencia: "",
    espaldarAsientos: "",
    compartimientosSuperiores: "",
  };
}

function initialFinalConfirmation() {
  return {
    limpiezaCompletada: "",
    securityCompletado: "",
    articuloSospechoso: "",
  };
}

export default function SupervisorCleaningSecurityPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(
    () => user?.position || getDefaultPosition(user?.role),
    [user]
  );

  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    horaIn: "",
    horaTerminacion: "",
    airline: "",
    otherAirlineName: "",
    flightNo: "",
    tailNo: "",
    airlineRep: "",
    verifiedByAirlineRep: "",
    supervisorName: visibleName,
    supervisorPosition: visiblePosition,
    supervisorSignature: "",
    airlineRepSignature: "",
    distribution: emptyDistribution(),
    limpieza: initialCleaningChecklist(),
    limpiezaObservaciones: "",
    security: initialSecurityChecklist(),
    securityObservaciones: "",
    finalConfirmation: initialFinalConfirmation(),
    suspiciousItemDetails: "",
    attachmentsNotes: "",
  });

  const [photoFiles, setPhotoFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const isErrorStatus =
    statusMessage.toLowerCase().includes("please") ||
    statusMessage.toLowerCase().includes("error");

  const resolvedAirline =
    form.airline === "Other"
      ? String(form.otherAirlineName || "").trim()
      : String(form.airline || "").trim();

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setNestedField = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files || []);

    const validFiles = files.filter((file) => file.type.startsWith("image/"));

    if (validFiles.length !== files.length) {
      setStatusMessage("Only image files are allowed for photos.");
      return;
    }

    const oversized = validFiles.find((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      setStatusMessage("Each photo must be smaller than 5MB.");
      return;
    }

    setPhotoFiles(validFiles);
  };

  const validateForm = () => {
    if (!form.fecha) return "Please select the date.";
    if (!form.horaIn) return "Please enter the start time.";
    if (!form.airline) return "Please select the airline.";
    if (form.airline === "Other" && !form.otherAirlineName.trim()) {
      return "Please write the airline name.";
    }
    if (!form.flightNo.trim()) return "Please enter the flight number.";
    if (!form.tailNo.trim()) return "Please enter the tail number.";
    if (!form.supervisorName.trim()) return "Please enter the supervisor name.";
    if (!form.supervisorSignature.trim()) {
      return "Please add supervisor signature.";
    }
    if (!form.airlineRep.trim()) {
      return "Please enter airline representative name.";
    }
    if (!form.airlineRepSignature.trim()) {
      return "Please add airline representative signature.";
    }

    const cleaningValues = Object.values(form.limpieza);
    if (cleaningValues.some((v) => !v)) {
      return "Please complete all cleaning checklist fields.";
    }

    const securityValues = Object.values(form.security);
    if (securityValues.some((v) => !v)) {
      return "Please complete all security checklist fields.";
    }

    const finalValues = Object.values(form.finalConfirmation);
    if (finalValues.some((v) => !v)) {
      return "Please complete the final confirmation section.";
    }

    if (
      form.finalConfirmation.articuloSospechoso === "Yes" &&
      !form.suspiciousItemDetails.trim()
    ) {
      return "Please explain the suspicious item found.";
    }

    return "";
  };

  const resetForm = () => {
    setForm({
      fecha: new Date().toISOString().slice(0, 10),
      horaIn: "",
      horaTerminacion: "",
      airline: "",
      otherAirlineName: "",
      flightNo: "",
      tailNo: "",
      airlineRep: "",
      verifiedByAirlineRep: "",
      supervisorName: visibleName,
      supervisorPosition: visiblePosition,
      supervisorSignature: "",
      airlineRepSignature: "",
      distribution: emptyDistribution(),
      limpieza: initialCleaningChecklist(),
      limpiezaObservaciones: "",
      security: initialSecurityChecklist(),
      securityObservaciones: "",
      finalConfirmation: initialFinalConfirmation(),
      suspiciousItemDetails: "",
      attachmentsNotes: "",
    });
    setPhotoFiles([]);
  };

  const uploadPhotos = async () => {
    if (!photoFiles.length) return [];

    const uploaded = [];

    for (const file of photoFiles) {
      const safeName = file.name
        .replace(/\s+/g, "_")
        .replace(/[^\w.-]/g, "");

      const storageRef = ref(
        storage,
        `cleaningSecurityReports/${Date.now()}_${safeName}`
      );

      const snap = await uploadBytes(storageRef, file, {
        contentType: file.type || "image/jpeg",
      });

      const url = await getDownloadURL(snap.ref);

      uploaded.push({
        name: file.name,
        url,
        contentType: file.type || "",
        size: file.size || 0,
      });
    }

    return uploaded;
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    const validationError = validateForm();
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }

    try {
      setSaving(true);

      const uploadedPhotos = await uploadPhotos();

      await addDoc(collection(db, "cleaning_security_reports"), {
        fecha: form.fecha,
        horaIn: form.horaIn,
        horaTerminacion: form.horaTerminacion || "",
        airline: resolvedAirline,
        airlineSelectedOption: form.airline,
        otherAirlineName: form.otherAirlineName.trim(),
        flightNo: form.flightNo.trim(),
        tailNo: form.tailNo.trim(),
        airlineRep: form.airlineRep.trim(),
        verifiedByAirlineRep: form.verifiedByAirlineRep.trim(),
        airlineRepSignature: form.airlineRepSignature.trim(),
        supervisorName: form.supervisorName.trim(),
        supervisorPosition: form.supervisorPosition.trim(),
        supervisorSignature: form.supervisorSignature.trim(),
        distribution: form.distribution,
        limpieza: form.limpieza,
        limpiezaObservaciones: form.limpiezaObservaciones.trim(),
        security: form.security,
        securityObservaciones: form.securityObservaciones.trim(),
        finalConfirmation: form.finalConfirmation,
        suspiciousItemDetails: form.suspiciousItemDetails.trim(),
        attachmentsNotes: form.attachmentsNotes.trim(),
        photos: uploadedPhotos,
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
        status: "submitted",
        reportType: "cleaning_and_security_search_report",
      });

      setStatusMessage(
        "Cleaning and Security Search Report submitted successfully."
      );
      resetForm();
    } catch (err) {
      console.error("Error saving cleaning/security report:", err);
      setStatusMessage("Error saving report.");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div
        style={{
          display: "grid",
          gap: isMobile ? 12 : 18,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "14px 14px" : "18px 20px",
            color: "#fff",
            boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 9 : 10,
              textTransform: "uppercase",
              letterSpacing: isMobile ? "0.12em" : "0.16em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            {APP_NAME} {"\u00B7"} Reports
          </p>
          <h1
            style={{
              margin: isMobile ? "6px 0 4px" : "8px 0 5px",
              fontSize: isMobile ? 21 : 25,
              lineHeight: 1.08,
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
              fontSize: isMobile ? 11.5 : 12.5,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Only supervisors and managers can submit this report.
          </p>
        </div>
      </div>
    );
  }

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(auto-fit, minmax(220px, 1fr))",
    gap: isMobile ? 10 : 14,
  };

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 18 : 22,
          padding: isMobile ? "14px 14px" : isTablet ? "16px 18px" : "18px 20px",
          color: "#fff",
          boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.07)",
            top: -92,
            right: -28,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            gap: isMobile ? 10 : 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: isMobile ? 9 : 10,
                textTransform: "uppercase",
                letterSpacing: isMobile ? "0.12em" : "0.16em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              {APP_NAME} {"\u00B7"} Cleaning & Security
            </p>

            <h1
              style={{
                margin: isMobile ? "6px 0 4px" : "8px 0 5px",
                fontSize: isMobile ? 20 : isTablet ? 23 : 25,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              Cleaning and Security Search Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: isMobile ? 11.5 : 12.5,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Supervisor form for cleaning distribution, security search, photos
              and airline representative sign-off.
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

          <div
            style={{
              width: isMobile ? "100%" : "auto",
              display: "flex",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => navigate("/dashboard")}
            >
              {"\u2190"} Back to Dashboard
            </ActionButton>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setStatusMessage("")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 20,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                background: isErrorStatus ? "#fff1f2" : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: isErrorStatus ? "#9f1239" : "#065f46",
                  letterSpacing: "-0.02em",
                }}
              >
                {isErrorStatus ? "Action Required" : "Success"}
              </div>
            </div>

            <div
              style={{
                padding: "18px 18px 16px",
                fontSize: 14,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 18px 18px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => setStatusMessage("")}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "10px 20px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={gridStyle}>
          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.fecha}
              onChange={(e) => setField("fecha", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Hora In</FieldLabel>
            <TextInput
              type="time"
              value={form.horaIn}
              onChange={(e) => setField("horaIn", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Hora de Terminacion</FieldLabel>
            <TextInput
              type="time"
              value={form.horaTerminacion}
              onChange={(e) => setField("horaTerminacion", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={form.airline}
              onChange={(e) => setField("airline", e.target.value)}
            >
              <option value="">Select airline</option>
              {AIRLINE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          {form.airline === "Other" && (
            <div>
              <FieldLabel>Other Airline Name</FieldLabel>
              <TextInput
                value={form.otherAirlineName}
                onChange={(e) => setField("otherAirlineName", e.target.value)}
                placeholder="Write airline name"
              />
            </div>
          )}

          <div>
            <FieldLabel>Flight No</FieldLabel>
            <TextInput
              value={form.flightNo}
              onChange={(e) => setField("flightNo", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Tail No</FieldLabel>
            <TextInput
              value={form.tailNo}
              onChange={(e) => setField("tailNo", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Supervisor</FieldLabel>
            <TextInput
              value={form.supervisorName}
              onChange={(e) => setField("supervisorName", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Supervisor Position</FieldLabel>
            <TextInput
              value={form.supervisorPosition}
              onChange={(e) => setField("supervisorPosition", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Airline Representative</FieldLabel>
            <TextInput
              value={form.airlineRep}
              onChange={(e) => setField("airlineRep", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Verified by Airline Rep</FieldLabel>
            <TextInput
              value={form.verifiedByAirlineRep}
              onChange={(e) => setField("verifiedByAirlineRep", e.target.value)}
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Work Distribution
        </h2>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Galley & Lav</FieldLabel>
            <TextInput
              value={form.distribution.galleyLav}
              onChange={(e) =>
                setNestedField("distribution", "galleyLav", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Left Row 1 to 11</FieldLabel>
            <TextInput
              value={form.distribution.left1to11}
              onChange={(e) =>
                setNestedField("distribution", "left1to11", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Right Row 1 to 11</FieldLabel>
            <TextInput
              value={form.distribution.right1to11}
              onChange={(e) =>
                setNestedField("distribution", "right1to11", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Left Row 12 to 21</FieldLabel>
            <TextInput
              value={form.distribution.left12to21}
              onChange={(e) =>
                setNestedField("distribution", "left12to21", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Right Row 12 to 21</FieldLabel>
            <TextInput
              value={form.distribution.right12to21}
              onChange={(e) =>
                setNestedField("distribution", "right12to21", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Left Row 22 to 31</FieldLabel>
            <TextInput
              value={form.distribution.left22to31}
              onChange={(e) =>
                setNestedField("distribution", "left22to31", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Right Row 22 to 31</FieldLabel>
            <TextInput
              value={form.distribution.right22to31}
              onChange={(e) =>
                setNestedField("distribution", "right22to31", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Vacuum</FieldLabel>
            <TextInput
              value={form.distribution.vacuum}
              onChange={(e) =>
                setNestedField("distribution", "vacuum", e.target.value)
              }
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Cleaning Checklist
        </h2>

        <div style={gridStyle}>
          <YesNoField
            label="Trash removed from seats and bins"
            value={form.limpieza.basuraRemovida}
            onChange={(value) =>
              setNestedField("limpieza", "basuraRemovida", value)
            }
          />
          <YesNoField
            label="Seat pockets organized / empty"
            value={form.limpieza.bolsillosOrganizados}
            onChange={(value) =>
              setNestedField("limpieza", "bolsillosOrganizados", value)
            }
          />
          <YesNoField
            label="Tray tables cleaned"
            value={form.limpieza.bandejasLimpias}
            onChange={(value) =>
              setNestedField("limpieza", "bandejasLimpias", value)
            }
          />
          <YesNoField
            label="Carpet / floor vacuumed"
            value={form.limpieza.alfombraAspirada}
            onChange={(value) =>
              setNestedField("limpieza", "alfombraAspirada", value)
            }
          />
          <YesNoField
            label="Lavatories checked and cleaned"
            value={form.limpieza.lavRevisados}
            onChange={(value) =>
              setNestedField("limpieza", "lavRevisados", value)
            }
          />
          <YesNoField
            label="Galley cleaned"
            value={form.limpieza.galleyLimpios}
            onChange={(value) =>
              setNestedField("limpieza", "galleyLimpios", value)
            }
          />
          <YesNoField
            label="Lavatory supplies replenished"
            value={form.limpieza.suministrosBanos}
            onChange={(value) =>
              setNestedField("limpieza", "suministrosBanos", value)
            }
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Cleaning observations / comments</FieldLabel>
          <TextArea
            value={form.limpiezaObservaciones}
            onChange={(e) => setField("limpiezaObservaciones", e.target.value)}
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Security Search Checklist
        </h2>

        <div style={gridStyle}>
          <YesNoField
            label="Under all seats checked"
            value={form.security.debajoAsientos}
            onChange={(value) =>
              setNestedField("security", "debajoAsientos", value)
            }
          />
          <YesNoField
            label="Seat pockets verified"
            value={form.security.bolsillosVerificados}
            onChange={(value) =>
              setNestedField("security", "bolsillosVerificados", value)
            }
          />
          <YesNoField
            label="Jump seats inspected"
            value={form.security.jumpSeats}
            onChange={(value) =>
              setNestedField("security", "jumpSeats", value)
            }
          />
          <YesNoField
            label="Lavatories inspected"
            value={form.security.lavabos}
            onChange={(value) =>
              setNestedField("security", "lavabos", value)
            }
          />
          <YesNoField
            label="Closets / cabinets verified"
            value={form.security.armarios}
            onChange={(value) =>
              setNestedField("security", "armarios", value)
            }
          />
          <YesNoField
            label="Emergency compartments checked"
            value={form.security.compartimientosEmergencia}
            onChange={(value) =>
              setNestedField(
                "security",
                "compartimientosEmergencia",
                value
              )
            }
          />
          <YesNoField
            label="Seat backs checked"
            value={form.security.espaldarAsientos}
            onChange={(value) =>
              setNestedField("security", "espaldarAsientos", value)
            }
          />
          <YesNoField
            label="Overhead bins checked"
            value={form.security.compartimientosSuperiores}
            onChange={(value) =>
              setNestedField(
                "security",
                "compartimientosSuperiores",
                value
              )
            }
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Security observations</FieldLabel>
          <TextArea
            value={form.securityObservaciones}
            onChange={(e) => setField("securityObservaciones", e.target.value)}
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Final Confirmation
        </h2>

        <div style={gridStyle}>
          <YesNoField
            label="Cleaning completed"
            value={form.finalConfirmation.limpiezaCompletada}
            onChange={(value) =>
              setNestedField(
                "finalConfirmation",
                "limpiezaCompletada",
                value
              )
            }
          />
          <YesNoField
            label="Security search completed"
            value={form.finalConfirmation.securityCompletado}
            onChange={(value) =>
              setNestedField(
                "finalConfirmation",
                "securityCompletado",
                value
              )
            }
          />
          <YesNoField
            label="Any suspicious item found?"
            value={form.finalConfirmation.articuloSospechoso}
            onChange={(value) =>
              setNestedField(
                "finalConfirmation",
                "articuloSospechoso",
                value
              )
            }
          />
        </div>

        {form.finalConfirmation.articuloSospechoso === "Yes" && (
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Suspicious item details</FieldLabel>
            <TextArea
              value={form.suspiciousItemDetails}
              onChange={(e) =>
                setField("suspiciousItemDetails", e.target.value)
              }
              placeholder="Explain the suspicious item found."
            />
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Photos and Signatures
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(260px, 1fr))",
            gap: isMobile ? 10 : 14,
          }}
        >
          <div>
            <FieldLabel>Photos</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              style={{ padding: "10px 12px" }}
            />
            {photoFiles.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                {photoFiles.length} photo(s) selected
              </div>
            )}
          </div>

          <SignatureBox
            label="Supervisor Signature"
            value={form.supervisorSignature}
            onChange={(value) => setField("supervisorSignature", value)}
          />

          <SignatureBox
            label="Airline Representative Signature"
            value={form.airlineRepSignature}
            onChange={(value) => setField("airlineRepSignature", value)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>Attachment notes</FieldLabel>
          <TextArea
            value={form.attachmentsNotes}
            onChange={(e) => setField("attachmentsNotes", e.target.value)}
            placeholder="Write notes about supporting files or photos."
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit report"}
          </ActionButton>

          <ActionButton
            onClick={resetForm}
            variant="secondary"
            disabled={saving}
          >
            Clear
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
