import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";

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
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid #e2e8f0",
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
        minHeight: 92,
        fontFamily: "inherit",
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

function UploadCheckBadge({ hasFiles }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 800,
        border: `1px solid ${hasFiles ? "#a7f3d0" : "#fdba74"}`,
        background: hasFiles ? "#ecfdf5" : "#fff7ed",
        color: hasFiles ? "#047857" : "#9a3412",
      }}
    >
      {hasFiles ? "Files uploaded" : "No files uploaded"}
    </span>
  );
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

function getRequestTypeLabel(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "supplies") return "Supplies Request";
  if (v === "uniform") return "Uniform Submit";
  if (v === "company_reimbursement") return "Company Reimbursement";
  if (v === "aa_ot") return "AA OT Request";
  if (v === "sy_ot") return "SY OT Request";
  if (v === "wl_ot") return "WL OT Request";
  if (v === "av_ot") return "AV OT Request";
  if (v === "dl_cabin_ot") return "Delta Cabin Service OT Request";

  return value || "\u2014";
}

function getAirlineFromRequestType(type) {
  const v = String(type || "").trim().toLowerCase();

  if (v === "aa_ot") return "American Airlines";
  if (v === "sy_ot") return "Sun Country";
  if (v === "wl_ot") return "World Atlantic";
  if (v === "av_ot") return "Avianca";
  if (v === "dl_cabin_ot") return "Delta Cabin Service";

  return "";
}

function isOtRequestType(type) {
  const v = String(type || "").trim().toLowerCase();

  return (
    v === "aa_ot" ||
    v === "sy_ot" ||
    v === "wl_ot" ||
    v === "av_ot" ||
    v === "dl_cabin_ot"
  );
}

function isImageFile(file) {
  return file?.type?.startsWith("image/");
}

export default function SupervisorOperationsRequestsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();

  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reimbursementFiles, setReimbursementFiles] = useState([]);

  const isAgent = user?.role === "agent";

  const canUseOt =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const requestTypeOptions = useMemo(() => {
    const base = [
      { value: "supplies", label: "Supplies Request" },
      { value: "uniform", label: "Uniform Submit" },
      { value: "company_reimbursement", label: "Company Reimbursement" },
    ];

    if (!canUseOt) return base;

    return [
      ...base,
      { value: "aa_ot", label: "AA OT Request" },
      { value: "sy_ot", label: "SY OT Request" },
      { value: "wl_ot", label: "WL OT Request" },
      { value: "av_ot", label: "AV OT Request" },
      { value: "dl_cabin_ot", label: "Delta Cabin Service OT Request" },
    ];
  }, [canUseOt]);

  const getInitialForm = () => ({
    requestType: isAgent ? "supplies" : "",
    date: "",
    airline: "",
    department: user?.department || "",
    submittedBy: getVisibleName(user),
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
    companyName: "",
    reimbursementCategory: "",
    reimbursementAmount: "",
    invoiceNumber: "",
    reimbursementReason: "",
  });

  const [form, setForm] = useState(getInitialForm);

  const isSupplies = form.requestType === "supplies";
  const isUniform = form.requestType === "uniform";
  const isReimbursement = form.requestType === "company_reimbursement";
  const isOt = isOtRequestType(form.requestType);

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "requestType") {
        const forcedAirline = getAirlineFromRequestType(value);

        next.items = "";
        next.pictureNotes = "";
        next.employeeName = "";
        next.employeeNumber = "";
        next.phoneNumber = "";
        next.totalAmount = "";
        next.receiptNotes = "";
        next.employeeSignature = "";
        next.flightNumber = "";
        next.tailNumber = "";
        next.delayedTime = "";
        next.delayedCode = "";
        next.reason = "";
        next.requestedHours = "";
        next.requestedBy = "";
        next.companyName = "";
        next.reimbursementCategory = "";
        next.reimbursementAmount = "";
        next.invoiceNumber = "";
        next.reimbursementReason = "";
        next.airline = forcedAirline || "";

        if (String(value || "").toLowerCase() === "dl_cabin_ot") {
          next.department = "Delta Cabin Service";
        }

        if (String(value || "").toLowerCase() !== "company_reimbursement") {
          setReimbursementFiles([]);
        }
      }

      return next;
    });
  };

  const resetForm = () => {
    setForm(getInitialForm());
    setReimbursementFiles([]);
  };

  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files || []);

    const oversized = files.find((file) => file.size > 10 * 1024 * 1024);

    if (oversized) {
      setStatusMessage(
        "Each reimbursement file must be smaller than 10MB."
      );
      return;
    }

    setReimbursementFiles(files);
  };

  const uploadReimbursementFiles = async () => {
    if (!reimbursementFiles.length) return [];

    setUploadingFiles(true);

    try {
      const uploadedUrls = [];

      for (const file of reimbursementFiles) {
        const safeName = `${Date.now()}-${file.name
          .replace(/\s+/g, "_")
          .replace(/[^\w.-]/g, "")}`;

        const storageRef = ref(
          storage,
          `company_reimbursements/${user?.id || "unknown"}/${safeName}`
        );

        await uploadBytes(storageRef, file, {
          contentType: file.type || undefined,
        });

        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      }

      return uploadedUrls;
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!form.requestType) {
      setStatusMessage("Please select a request type.");
      return;
    }

    if (!form.date) {
      setStatusMessage("Please select the date.");
      return;
    }

    if (isSupplies) {
      if (!String(form.department || "").trim()) {
        setStatusMessage("Please enter the department.");
        return;
      }

      if (!String(form.items || "").trim()) {
        setStatusMessage("Please enter the requested supplies.");
        return;
      }
    }

    if (isUniform) {
      if (!String(form.employeeName || "").trim()) {
        setStatusMessage("Please enter employee name.");
        return;
      }

      if (!String(form.employeeNumber || "").trim()) {
        setStatusMessage("Please enter employee number.");
        return;
      }
    }

    if (isReimbursement) {
      if (!String(form.companyName || "").trim()) {
        setStatusMessage("Please enter company name.");
        return;
      }

      if (!String(form.employeeName || "").trim()) {
        setStatusMessage("Please enter employee name.");
        return;
      }

      if (!String(form.reimbursementCategory || "").trim()) {
        setStatusMessage("Please enter reimbursement category.");
        return;
      }

      const reimbursementAmount = Number(form.reimbursementAmount);

      if (
        !String(form.reimbursementAmount || "").trim() ||
        !Number.isFinite(reimbursementAmount) ||
        reimbursementAmount <= 0
      ) {
        setStatusMessage("Please enter a valid reimbursement amount.");
        return;
      }

      if (!String(form.reimbursementReason || "").trim()) {
        setStatusMessage("Please enter reimbursement reason.");
        return;
      }

      if (!reimbursementFiles.length) {
        setStatusMessage("Please upload at least one invoice or photo.");
        return;
      }
    }

    if (isOt) {
      if (!String(form.airline || "").trim()) {
        setStatusMessage("Please confirm the airline.");
        return;
      }

      if (!String(form.flightNumber || "").trim()) {
        setStatusMessage("Please enter the flight number.");
        return;
      }

      if (!String(form.reason || "").trim()) {
        setStatusMessage("Please enter the reason for the OT request.");
        return;
      }
    }

    try {
      setSaving(true);

      let reimbursementUrls = [];

      if (isReimbursement) {
        reimbursementUrls = await uploadReimbursementFiles();
      }

      const requestPayload = {
        requestType: form.requestType,
        requestTypeLabel: getRequestTypeLabel(form.requestType),

        category: isSupplies
          ? "supplies"
          : isUniform
          ? "uniform"
          : isReimbursement
          ? "company_reimbursement"
          : "ot",

        date: form.date,
        airline: form.airline || "",
        department: form.department || "",
        submittedBy: form.submittedBy || "",
        email: form.email || "",
        items: form.items || "",
        pictureNotes: form.pictureNotes || "",
        employeeName: form.employeeName || "",
        employeeNumber: form.employeeNumber || "",
        phoneNumber: form.phoneNumber || "",
        totalAmount: form.totalAmount || "",
        receiptNotes: form.receiptNotes || "",
        employeeSignature: form.employeeSignature || "",
        flightNumber: form.flightNumber || "",
        tailNumber: form.tailNumber || "",
        delayedTime: form.delayedTime || "",
        delayedCode: form.delayedCode || "",
        reason: form.reason || "",
        requestedHours: form.requestedHours || "",
        requestedBy: form.requestedBy || "",
        companyName: form.companyName || "",
        reimbursementCategory: form.reimbursementCategory || "",
        reimbursementAmount: form.reimbursementAmount || "",
        invoiceNumber: form.invoiceNumber || "",
        reimbursementReason: form.reimbursementReason || "",
        reimbursementPhotos: reimbursementUrls,
        receiptUrls: reimbursementUrls,
        filesUploaded: reimbursementUrls.length > 0,
        filesCount: reimbursementUrls.length,
        status: "submitted",
        managerStatus: "submitted",
        archived: false,
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
      };

      const requestRef = await addDoc(
        collection(db, "supplies_uniform_ot_requests"),
        requestPayload
      );

      try {
        const typeLabel = getRequestTypeLabel(form.requestType);

        const details = [];

        if (isSupplies && form.items) {
          details.push(`Items: ${String(form.items).trim()}.`);
        }

        if (isUniform && form.employeeName) {
          details.push(
            `Employee: ${String(form.employeeName).trim()}.`
          );
        }

        if (isReimbursement) {
          details.push(
            `Company: ${String(form.companyName).trim()}.`
          );
          details.push(
            `Amount: $${Number(form.reimbursementAmount || 0).toFixed(2)}.`
          );
        }

        if (isOt) {
          details.push(
            `Airline: ${String(form.airline || "").trim()}.`
          );
          details.push(
            `Flight: ${String(form.flightNumber || "").trim()}.`
          );

          if (String(form.requestedHours || "").trim()) {
            details.push(
              `Requested hours: ${String(form.requestedHours).trim()}.`
            );
          }
        }

        await createOperationalAlert({
          alertType: "OPERATIONS_REQUEST_SUBMITTED",
          category: "OPERATIONS_REQUEST",
          severity: "LOW",
          priority: "LOW",
          title: `${typeLabel} Submitted`,
          message: [
            `${typeLabel} was submitted for management review.`,
            ...details,
            `Submitted by: ${String(
              form.submittedBy || getVisibleName(user)
            ).trim()}.`,
          ].join(" "),
          source: "SupervisorOperationsRequestsPage",
          sourceId: requestRef.id,
          airline: form.airline || "",
          department: form.department || "",
          reportDate: form.date,
          targetRoles: ["station_manager", "duty_manager"],
          createdByUserId: user?.id || "",
          createdByUsername: user?.username || "",
          createdByName: getVisibleName(user),
          createdByRole: user?.role || "",
          metadata: {
            requestId: requestRef.id,
            requestType: form.requestType,
            requestTypeLabel: typeLabel,
            requestCategory: requestPayload.category,
            employeeName: form.employeeName || "",
            companyName: form.companyName || "",
            reimbursementAmount: isReimbursement
              ? Number(form.reimbursementAmount || 0)
              : 0,
            flightNumber: form.flightNumber || "",
            requestedHours: form.requestedHours || "",
            reason: form.reason || "",
            filesCount: reimbursementUrls.length,
          },
        });
      } catch (alertErr) {
        console.error(
          "Operations Request alert error:",
          alertErr
        );
      }

      setStatusMessage("Request submitted successfully.");
      resetForm();
    } catch (err) {
      console.error("Error saving request:", err);
      setStatusMessage("Could not submit request.");
    } finally {
      setSaving(false);
    }
  };

  const selectedFilesCount = reimbursementFiles.length > 0;
  const busy = saving || uploadingFiles;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(auto-fit, minmax(240px, 1fr))",
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
          padding: isMobile
            ? "14px"
            : isTablet
            ? "16px 18px"
            : "18px 20px",
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
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: isMobile ? 5 : 7,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: isMobile ? 34 : 40,
                  height: isMobile ? 34 : 40,
                  borderRadius: 10,
                  objectFit: "contain",
                  background: "#ffffff",
                  flexShrink: 0,
                }}
              />

              <p
                style={{
                  margin: 0,
                  fontSize: isMobile ? 9 : 10,
                  textTransform: "uppercase",
                  letterSpacing: isMobile ? "0.12em" : "0.16em",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Operations Requests
              </p>
            </div>

            <h1
              style={{
                margin: "0 0 4px",
                fontSize: isMobile ? 20 : isTablet ? 23 : 25,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              Supplies, Uniform, Reimbursement & OT
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
              Submit operational requests from one place. Each submission sends
              a low-priority management review alert.
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
              onClick={() => navigate("/dashboard")}
              variant="secondary"
              disabled={busy}
            >
              {"\u2190"} Back to Dashboard
            </ActionButton>
          </div>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              background:
                statusMessage.toLowerCase().includes("could not") ||
                statusMessage.toLowerCase().includes("please")
                  ? "#fff1f2"
                  : "#ecfdf5",
              border:
                statusMessage.toLowerCase().includes("could not") ||
                statusMessage.toLowerCase().includes("please")
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              borderRadius: 14,
              padding: "12px 14px",
              color:
                statusMessage.toLowerCase().includes("could not") ||
                statusMessage.toLowerCase().includes("please")
                  ? "#9f1239"
                  : "#065f46",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={gridStyle}>
          <div>
            <FieldLabel>Request Type</FieldLabel>
            <SelectInput
              value={form.requestType}
              onChange={(e) =>
                handleChange("requestType", e.target.value)
              }
            >
              <option value="">Select request type</option>
              {requestTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) =>
                handleChange("date", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Submitted By</FieldLabel>
            <TextInput
              value={form.submittedBy}
              onChange={(e) =>
                handleChange("submittedBy", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) =>
                handleChange("email", e.target.value)
              }
              placeholder="name@email.com"
            />
          </div>
        </div>
      </PageCard>

      {isSupplies && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Supplies Request
          </h2>

          <div style={gridStyle}>
            <div>
              <FieldLabel>Department</FieldLabel>
              <TextInput
                value={form.department}
                onChange={(e) =>
                  handleChange("department", e.target.value)
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Items Needed</FieldLabel>
            <TextArea
              value={form.items}
              onChange={(e) =>
                handleChange("items", e.target.value)
              }
              placeholder="List the supplies needed"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Picture / Attachment Notes</FieldLabel>
            <TextArea
              value={form.pictureNotes}
              onChange={(e) =>
                handleChange("pictureNotes", e.target.value)
              }
              placeholder="Describe photos or attached files"
            />
          </div>
        </PageCard>
      )}

      {isUniform && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Uniform Submit
          </h2>

          <div style={gridStyle}>
            <div>
              <FieldLabel>Employee Name</FieldLabel>
              <TextInput
                value={form.employeeName}
                onChange={(e) =>
                  handleChange("employeeName", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Employee Number</FieldLabel>
              <TextInput
                value={form.employeeNumber}
                onChange={(e) =>
                  handleChange("employeeNumber", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Phone Number</FieldLabel>
              <TextInput
                value={form.phoneNumber}
                onChange={(e) =>
                  handleChange("phoneNumber", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Total Amount</FieldLabel>
              <TextInput
                value={form.totalAmount}
                onChange={(e) =>
                  handleChange("totalAmount", e.target.value)
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Receipt Notes</FieldLabel>
            <TextArea
              value={form.receiptNotes}
              onChange={(e) =>
                handleChange("receiptNotes", e.target.value)
              }
              placeholder="Receipt reference, notes or upload description"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Employee Signature</FieldLabel>
            <TextInput
              value={form.employeeSignature}
              onChange={(e) =>
                handleChange("employeeSignature", e.target.value)
              }
              placeholder="Type full name as signature"
            />
          </div>
        </PageCard>
      )}

      {isReimbursement && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 19,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Company Reimbursement
            </h2>

            <UploadCheckBadge hasFiles={selectedFilesCount} />
          </div>

          <div style={gridStyle}>
            <div>
              <FieldLabel>Company Name</FieldLabel>
              <TextInput
                value={form.companyName}
                onChange={(e) =>
                  handleChange("companyName", e.target.value)
                }
                placeholder="Example: Vendor / Company"
              />
            </div>

            <div>
              <FieldLabel>Department</FieldLabel>
              <TextInput
                value={form.department}
                onChange={(e) =>
                  handleChange("department", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Employee Name</FieldLabel>
              <TextInput
                value={form.employeeName}
                onChange={(e) =>
                  handleChange("employeeName", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Reimbursement Category</FieldLabel>
              <TextInput
                value={form.reimbursementCategory}
                onChange={(e) =>
                  handleChange(
                    "reimbursementCategory",
                    e.target.value
                  )
                }
                placeholder="Fuel, parking, meal, uniform, etc."
              />
            </div>

            <div>
              <FieldLabel>Amount</FieldLabel>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.reimbursementAmount}
                onChange={(e) =>
                  handleChange(
                    "reimbursementAmount",
                    e.target.value
                  )
                }
                placeholder="Example: 45.80"
              />
            </div>

            <div>
              <FieldLabel>Invoice Number</FieldLabel>
              <TextInput
                value={form.invoiceNumber}
                onChange={(e) =>
                  handleChange("invoiceNumber", e.target.value)
                }
                placeholder="Invoice or receipt #"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Reason</FieldLabel>
            <TextArea
              value={form.reimbursementReason}
              onChange={(e) =>
                handleChange(
                  "reimbursementReason",
                  e.target.value
                )
              }
              placeholder="Explain what the reimbursement is for"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Upload Invoice / Photos</FieldLabel>
            <TextInput
              type="file"
              multiple
              accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFilesChange}
              style={{ padding: "10px 12px" }}
            />
          </div>

          {reimbursementFiles.length > 0 && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: isMobile ? 10 : 12,
                background: "#f8fbff",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Selected Files
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {reimbursementFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: 6,
                      padding: "9px 10px",
                      background: "#ffffff",
                      border: "1px solid #dbeafe",
                      borderRadius: 11,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "#0f172a",
                        wordBreak: "break-word",
                      }}
                    >
                      {file.name}
                    </div>

                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "#64748b",
                      }}
                    >
                      {isImageFile(file) ? "Image" : "File"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PageCard>
      )}

      {isOt && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {getRequestTypeLabel(form.requestType)}
          </h2>

          <div style={gridStyle}>
            <div>
              <FieldLabel>Airline</FieldLabel>
              <TextInput value={form.airline} disabled />
            </div>

            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={form.flightNumber}
                onChange={(e) =>
                  handleChange("flightNumber", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Tail Number</FieldLabel>
              <TextInput
                value={form.tailNumber}
                onChange={(e) =>
                  handleChange("tailNumber", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Delayed Time</FieldLabel>
              <TextInput
                value={form.delayedTime}
                onChange={(e) =>
                  handleChange("delayedTime", e.target.value)
                }
                placeholder="Example: 02:30"
              />
            </div>

            <div>
              <FieldLabel>Delayed Code</FieldLabel>
              <TextInput
                value={form.delayedCode}
                onChange={(e) =>
                  handleChange("delayedCode", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Requested Hours</FieldLabel>
              <TextInput
                type="number"
                min="0"
                step="0.25"
                inputMode="decimal"
                value={form.requestedHours}
                onChange={(e) =>
                  handleChange("requestedHours", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Requested By</FieldLabel>
              <TextInput
                value={form.requestedBy}
                onChange={(e) =>
                  handleChange("requestedBy", e.target.value)
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Reason</FieldLabel>
            <TextArea
              value={form.reason}
              onChange={(e) =>
                handleChange("reason", e.target.value)
              }
              placeholder="Explain why OT is being requested"
            />
          </div>
        </PageCard>
      )}

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
            disabled={busy}
          >
            {saving
              ? "Submitting..."
              : uploadingFiles
              ? "Uploading files..."
              : "Submit Request"}
          </ActionButton>

          <ActionButton
            onClick={resetForm}
            variant="secondary"
            disabled={busy}
          >
            Clear
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
