import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

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
        minHeight: 110,
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
  if (v === "aa_ot") return "AA OT Request";
  if (v === "sy_ot") return "SY OT Request";
  if (v === "wl_ot") return "WL OT Request";
  if (v === "av_ot") return "AV OT Request";

  return value || "—";
}

function getAirlineFromRequestType(type) {
  const v = String(type || "").trim().toLowerCase();

  if (v === "aa_ot") return "American Airlines";
  if (v === "sy_ot") return "Sun Country";
  if (v === "wl_ot") return "World Atlantic";
  if (v === "av_ot") return "Avianca";

  return "";
}

export default function SupervisorOperationsRequestsPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const isAgent = user?.role === "agent";
  const canUseOt =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const requestTypeOptions = useMemo(() => {
    const base = [
      { value: "supplies", label: "Supplies Request" },
      { value: "uniform", label: "Uniform Submit" },
    ];

    if (!canUseOt) return base;

    return [
      ...base,
      { value: "aa_ot", label: "AA OT Request" },
      { value: "sy_ot", label: "SY OT Request" },
      { value: "wl_ot", label: "WL OT Request" },
      { value: "av_ot", label: "AV OT Request" },
    ];
  }, [canUseOt]);

  const [form, setForm] = useState({
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
  });

  const isSupplies = form.requestType === "supplies";
  const isUniform = form.requestType === "uniform";
  const isOt =
    form.requestType === "aa_ot" ||
    form.requestType === "sy_ot" ||
    form.requestType === "wl_ot" ||
    form.requestType === "av_ot";

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

        if (forcedAirline) {
          next.airline = forcedAirline;
        } else {
          next.airline = "";
        }
      }

      return next;
    });
  };

  const resetForm = () => {
    setForm({
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
    });
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

      await addDoc(collection(db, "supplies_uniform_ot_requests"), {
        requestType: form.requestType,
        requestTypeLabel: getRequestTypeLabel(form.requestType),
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
        status: "submitted",
        archived: false,
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
      });

      setStatusMessage("Request submitted successfully.");
      resetForm();
    } catch (err) {
      console.error("Error saving request:", err);
      setStatusMessage("Could not submit request.");
    } finally {
      setSaving(false);
    }
  };

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
          TPA OPS · Requests
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
          Supplies, Uniform & OT Requests
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Submit supplies requests, uniform orders and overtime requests from one place.
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
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Request Type</FieldLabel>
            <SelectInput
              value={form.requestType}
              onChange={(e) => handleChange("requestType", e.target.value)}
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
              onChange={(e) => handleChange("date", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Submitted By</FieldLabel>
            <TextInput
              value={form.submittedBy}
              onChange={(e) => handleChange("submittedBy", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="name@email.com"
            />
          </div>
        </div>
      </PageCard>

      {isSupplies && (
        <PageCard style={{ padding: 22 }}>
          <h2
            style={{
              marginTop: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Supplies Request
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Department</FieldLabel>
              <TextInput
                value={form.department}
                onChange={(e) => handleChange("department", e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Items Needed</FieldLabel>
            <TextArea
              value={form.items}
              onChange={(e) => handleChange("items", e.target.value)}
              placeholder="List the supplies needed"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Picture / Attachment Notes</FieldLabel>
            <TextArea
              value={form.pictureNotes}
              onChange={(e) => handleChange("pictureNotes", e.target.value)}
              placeholder="Describe photos or attached files"
            />
          </div>
        </PageCard>
      )}

      {isUniform && (
        <PageCard style={{ padding: 22 }}>
          <h2
            style={{
              marginTop: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Uniform Submit
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Employee Name</FieldLabel>
              <TextInput
                value={form.employeeName}
                onChange={(e) => handleChange("employeeName", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Employee Number</FieldLabel>
              <TextInput
                value={form.employeeNumber}
                onChange={(e) => handleChange("employeeNumber", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Phone Number</FieldLabel>
              <TextInput
                value={form.phoneNumber}
                onChange={(e) => handleChange("phoneNumber", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Total Amount</FieldLabel>
              <TextInput
                value={form.totalAmount}
                onChange={(e) => handleChange("totalAmount", e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Receipt Notes</FieldLabel>
            <TextArea
              value={form.receiptNotes}
              onChange={(e) => handleChange("receiptNotes", e.target.value)}
              placeholder="Receipt reference, notes or upload description"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Employee Signature</FieldLabel>
            <TextInput
              value={form.employeeSignature}
              onChange={(e) => handleChange("employeeSignature", e.target.value)}
              placeholder="Type full name as signature"
            />
          </div>
        </PageCard>
      )}

      {isOt && (
        <PageCard style={{ padding: 22 }}>
          <h2
            style={{
              marginTop: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {getRequestTypeLabel(form.requestType)}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Airline</FieldLabel>
              <TextInput value={form.airline} disabled />
            </div>

            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={form.flightNumber}
                onChange={(e) => handleChange("flightNumber", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Tail Number</FieldLabel>
              <TextInput
                value={form.tailNumber}
                onChange={(e) => handleChange("tailNumber", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Delayed Time</FieldLabel>
              <TextInput
                value={form.delayedTime}
                onChange={(e) => handleChange("delayedTime", e.target.value)}
                placeholder="Example: 02:30"
              />
            </div>

            <div>
              <FieldLabel>Delayed Code</FieldLabel>
              <TextInput
                value={form.delayedCode}
                onChange={(e) => handleChange("delayedCode", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Requested Hours</FieldLabel>
              <TextInput
                value={form.requestedHours}
                onChange={(e) => handleChange("requestedHours", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Requested By</FieldLabel>
              <TextInput
                value={form.requestedBy}
                onChange={(e) => handleChange("requestedBy", e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Reason</FieldLabel>
            <TextArea
              value={form.reason}
              onChange={(e) => handleChange("reason", e.target.value)}
              placeholder="Explain why OT is being requested"
            />
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit Request"}
          </ActionButton>

          <ActionButton onClick={resetForm} variant="secondary">
            Clear
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
            Back to Dashboard
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
