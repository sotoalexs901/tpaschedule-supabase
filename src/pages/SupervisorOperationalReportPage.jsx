// src/pages/SupervisorOperationalReportPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();
  const upper = airline.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
}

function normalizeCabinServiceValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "cabin_service";
  }

  return raw;
}

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

function buildInitialResponses(fields) {
  const result = {};

  (fields || []).forEach((field) => {
    if (!field?.key) return;

    if (field.type === "checkbox-group") {
      result[field.key] = [];
      return;
    }

    result[field.key] = "";
  });

  return result;
}

function shouldRequireAttentionFromResponses(responses) {
  const operationStatus = String(
    responses?.operation_status || ""
  ).toLowerCase();

  const safetyConcern = String(
    responses?.safety_concern || ""
  ).toLowerCase();

  const delayedFlight =
    String(responses?.delayed_flight || "").toLowerCase() === "yes" ||
    String(responses?.delayed_flight_impact || "").toLowerCase() === "yes" ||
    String(responses?.service_delays || "").toLowerCase() === "yes";

  if (
    operationStatus.includes("not completed") ||
    operationStatus.includes("remarks")
  ) {
    return true;
  }

  if (safetyConcern === "yes") return true;
  if (delayedFlight) return true;

  return false;
}

function hasOvertimeReported(responses) {
  const staffing = Array.isArray(responses?.staffing_status)
    ? responses.staffing_status
    : [];

  return staffing.some((item) =>
    String(item || "").toLowerCase().includes("overtime")
  );
}

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

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SY" },
  { value: "WestJet", label: "WestJet" },
  { value: "WL Invicta", label: "WL Invicta" },
  { value: "AV", label: "AV" },
  { value: "EA", label: "EA" },
  { value: "WCHR", label: "WCHR" },
  { value: "CABIN", label: "Cabin Service" },
  { value: "AA-BSO", label: "AA-BSO" },
  { value: "DL", label: "Delta Air Lines" },
  { value: "OTHER", label: "Other" },
];

const BAGGAGE_FIELDS = [
  {
    key: "operation_status",
    label: "Operation Status",
    type: "select",
    required: true,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operation not completed as planned",
    ],
  },
  {
    key: "general_comments",
    label: "General Comments",
    type: "textarea",
  },
  {
    key: "issue_types",
    label: "Issue Types (select all that apply)",
    type: "checkbox-group",
    options: [
      "N/A",
      "Delays",
      "Staffing",
      "Baggage",
      "Equipment",
      "Customer Service",
      "Operational",
      "Safety",
      "Other",
    ],
  },
  { key: "issue_details", label: "Issue Details", type: "textarea" },
  { key: "action_taken", label: "Action Taken", type: "textarea" },
  {
    key: "issue_status",
    label: "Status",
    type: "select",
    options: ["N/A", "Resolved", "Pending", "Escalated"],
  },
  { key: "ohd_bags_managed", label: "OHD Bags Managed", type: "text" },
  { key: "delayed_file", label: "Delayed File", type: "text" },
  { key: "damage_file", label: "Damage File", type: "text" },
  { key: "bdos", label: "BDOs", type: "text" },
  { key: "total_bags_processed", label: "Total Bags Processed", type: "text" },
  {
    key: "ohd_bags_follow_up_actions",
    label: "OHD Bags Follow-up Actions",
    type: "textarea",
  },
  { key: "pending_responsible", label: "Pending Responsible", type: "text" },
  { key: "ramp_scan", label: "Ramp Scan", type: "text" },
  { key: "pending_target_day", label: "Pending Target Day", type: "text" },
  {
    key: "exception_type",
    label: "Exception Type",
    type: "checkbox-group",
    options: ["N/A", "Operational", "Staffing", "Safety", "Baggage", "Other"],
  },
  {
    key: "exception_description",
    label: "Exception Description",
    type: "textarea",
  },
  {
    key: "exception_reason",
    label: "Exception Reason",
    type: "textarea",
  },
  { key: "reported_to", label: "Reported To", type: "text" },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    options: [
      "Full staffing",
      "Short staffed",
      "Overtime needed",
      "Call out",
      "Other",
    ],
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
  },
  {
    key: "employee_breaks",
    label: "Employee Breaks",
    type: "select",
    options: [
      "All agents have taken their scheduled break",
      "Not all agents have taken their scheduled break",
    ],
  },
  {
    key: "employees_no_break_taken",
    label: "Names of Employees / No Break Taken",
    type: "textarea",
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
  },
  {
    key: "safety_concern",
    label: "Safety Concerns",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "additional_comments",
    label: "Additional Comments",
    type: "textarea",
  },
];

const WCHR_FIELDS = [
  {
    key: "operation_status",
    label: "Operational Status",
    type: "select",
    required: true,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operation not completed as planned",
    ],
  },
  { key: "total_wheelchair_requests", label: "Total Wheelchair Requests", type: "text" },
  { key: "departing_passengers_assisted", label: "Departing Passengers Assisted", type: "text" },
  { key: "arriving_passengers_assisted", label: "Arriving Passengers Assisted", type: "text" },
  {
    key: "service_type",
    label: "Service Type (select all that apply)",
    type: "checkbox-group",
    options: ["WCHR", "WCHS", "WCHC", "WCBD", "WCMP"],
  },
  {
    key: "service_delays",
    label: "Any Service Delays?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "delay_reasons",
    label: "If Yes, select reason(s)",
    type: "checkbox-group",
    options: [
      "High passenger volume",
      "Staffing shortage",
      "Late flight arrival",
      "Equipment shortage",
      "TSA delays",
      "Other",
    ],
  },
  { key: "delay_details", label: "Delay Details", type: "textarea" },
  {
    key: "fulfilled_all_requests",
    label: "Were all wheelchair requests fulfilled?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "assisted_on_time",
    label: "Were passengers assisted on time from check-in to gate?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "arrivals_picked_up_without_delay",
    label: "Were arriving passengers picked up from the aircraft without delay?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "tsa_coordination_effective",
    label: "Was coordination with TSA handled effectively?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "passenger_information_handled_correctly",
    label: "Was passenger information correctly handled and recorded?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "proper_handoffs_completed",
    label: "Were proper handoffs completed (gate / aircraft / arrivals area)?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "issue_types",
    label: "Issue Types (select all that apply)",
    type: "checkbox-group",
    options: [
      "N/A",
      "Delays",
      "Staffing",
      "Equipment",
      "Customer Service",
      "Operational",
      "Safety",
      "Other",
    ],
  },
  { key: "issue_details", label: "Issue Details", type: "textarea" },
  { key: "action_taken", label: "Action Taken", type: "textarea" },
  {
    key: "issue_status",
    label: "Status",
    type: "select",
    options: ["Resolved", "Pending", "Escalated"],
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    options: [
      "Fully staffed",
      "Short staffed",
      "Overtime required",
      "Call out(s)",
      "Other",
    ],
  },
  { key: "staffing_remarks", label: "Staffing Remarks", type: "textarea" },
  { key: "wheelchairs_available", label: "Wheelchairs Available", type: "text" },
  {
    key: "equipment_issues",
    label: "Any Equipment Issues?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "equipment_issue_details",
    label: "If Yes, explain",
    type: "textarea",
  },
  {
    key: "passenger_service_issues",
    label: "Any customer complaints or service issues?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "passenger_service_issue_details",
    label: "Complaint / Service Issue Details",
    type: "textarea",
  },
  {
    key: "employee_breaks",
    label: "Employees Breaks",
    type: "select",
    options: [
      "All agents took scheduled breaks",
      "Not all agents took scheduled breaks",
    ],
  },
  {
    key: "employee_breaks_details",
    label: "Names / Details",
    type: "textarea",
  },
  {
    key: "safety_concern",
    label: "Any safety concerns during operation?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
  },
];

const CABIN_SERVICE_FIELDS = [
  {
    key: "operation_status",
    label: "Operation Status",
    type: "select",
    required: true,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operation not completed as planned",
    ],
  },
  {
    key: "flights_serviced_confirmation",
    label: "Were all flights serviced based on the total flights entered?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "cabin_cleaning_completed_all",
    label: "Was cabin cleaning completed for all flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "lavatories_completed_all",
    label: "Were lavatories serviced correctly for all flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "galleys_completed_all",
    label: "Were galleys cleaned and checked for all flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "trash_removed_all",
    label: "Was trash removed correctly from all flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "seat_checks_completed_all",
    label: "Were seats, seat pockets, and tray tables checked on all flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "special_cleaning_required",
    label: "Was special cleaning required during the shift?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "special_cleaning_details",
    label: "Special Cleaning Details",
    type: "textarea",
  },
  {
    key: "equipment_or_supply_issues",
    label: "Were there equipment or supply issues affecting any flights serviced?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "equipment_or_supply_issue_details",
    label: "Equipment / Supply Issue Details",
    type: "textarea",
  },
  {
    key: "delayed_flight_impact",
    label: "Did any delay impact cabin service during the shift?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  { key: "delay_reason", label: "Delay Reason", type: "textarea" },
  { key: "delay_minutes", label: "Delay Minutes", type: "text" },
  {
    key: "safety_concern",
    label: "Any Safety Concern?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    options: [
      "Fully staffed",
      "Short staffed",
      "Overtime required",
      "Call out(s)",
      "Other",
    ],
  },
  { key: "staffing_remarks", label: "Staffing Remarks", type: "textarea" },
  {
    key: "quality_consistency",
    label: "Was service quality consistent across all flights serviced?",
    type: "select",
    options: ["Yes", "Mostly Yes", "Needs Improvement"],
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
  },
];

const PASSENGER_SERVICE_FIELDS = [
  {
    key: "operation_status",
    label: "Operation Status",
    type: "select",
    required: true,
    options: [
      "Operation completed with no issues",
      "Operation completed with remarks",
      "Operation not completed as planned",
    ],
  },
  { key: "flights_handled", label: "Flights Handled", type: "text" },
  {
    key: "checkin_completed",
    label: "Check-in Operation Completed?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "boarding_completed",
    label: "Boarding Operation Completed?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "document_checks_completed",
    label: "Passenger Document Checks Completed?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "special_assistance_handled",
    label: "Special Assistance Requests Handled Properly?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "oversize_or_special_bag_issues",
    label: "Oversize / Special Bag Issues?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "oversize_or_special_bag_details",
    label: "Oversize / Special Bag Details",
    type: "textarea",
  },
  {
    key: "boarding_gate_change",
    label: "Any Gate Change?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  { key: "gate_change_details", label: "Gate Change Details", type: "textarea" },
  {
    key: "standby_upgrade_irregularities",
    label: "Standby / Upgrade / Seating Irregularities?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "standby_upgrade_details",
    label: "Standby / Upgrade Details",
    type: "textarea",
  },
  {
    key: "customer_service_issues",
    label: "Customer Service Issues?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "customer_service_issue_details",
    label: "Customer Service Issue Details",
    type: "textarea",
  },
  {
    key: "delayed_flight",
    label: "Any Delayed Flight?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  { key: "delayed_flight_minutes", label: "Delayed Minutes", type: "text" },
  {
    key: "delayed_flight_reason",
    label: "Delayed Flight Reason",
    type: "textarea",
  },
  {
    key: "safety_concern",
    label: "Any Safety Concern?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    options: [
      "Fully staffed",
      "Short staffed",
      "Overtime required",
      "Call out(s)",
      "Other",
    ],
  },
  { key: "staffing_remarks", label: "Staffing Remarks", type: "textarea" },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
  },
];

const OPERATIONAL_REPORT_TEMPLATES = {
  baggage: {
    key: "baggage",
    label: "Baggage Handling",
    department: "Baggage Handling",
    airlineDefault: "",
    fields: BAGGAGE_FIELDS,
    hideFlightNumber: false,
  },
  wchr: {
    key: "wchr",
    label: "WCHR Service",
    department: "WCHR Service",
    airlineDefault: "WCHR",
    fields: WCHR_FIELDS,
    hideFlightNumber: false,
  },
  cabin_service: {
    key: "cabin_service",
    label: "Cabin Service",
    department: "Cabin Service",
    airlineDefault: "",
    fields: CABIN_SERVICE_FIELDS,
    hideFlightNumber: true,
  },
  passenger_service: {
    key: "passenger_service",
    label: "Passenger Service",
    department: "Passenger Service",
    airlineDefault: "",
    fields: PASSENGER_SERVICE_FIELDS,
    hideFlightNumber: false,
  },
};

export default function SupervisorOperationalReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const normalizedDepartment = normalizeCabinServiceValue(user?.department);
  const isCabinServiceUser = normalizedDepartment === "cabin_service";

  const defaultTemplateKey = isCabinServiceUser
    ? "cabin_service"
    : "passenger_service";

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState({
    templateKey: defaultTemplateKey,
    airline:
      OPERATIONAL_REPORT_TEMPLATES[defaultTemplateKey]?.airlineDefault || "",
    reportDate: "",
    department:
      OPERATIONAL_REPORT_TEMPLATES[defaultTemplateKey]?.department || "",
    shift: "",
    flightNumber: "",
    flightsHandled: "",
    supervisorReporting: getVisibleName(user),
    supervisorPosition:
      user?.position || getDefaultPosition(user?.role),
    notes: "",
    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",
    hasLobs: false,
    lobBagCount: "",
    lobAgentsUsed: "",
    lobSupervisorsUsed: "",
    needsAttention: false,
    responses: buildInitialResponses(
      OPERATIONAL_REPORT_TEMPLATES[defaultTemplateKey]?.fields || []
    ),
  });

  const activeTemplate = useMemo(() => {
    return (
      OPERATIONAL_REPORT_TEMPLATES[form.templateKey] ||
      OPERATIONAL_REPORT_TEMPLATES.passenger_service
    );
  }, [form.templateKey]);

  const dynamicFields = useMemo(() => {
    return activeTemplate.fields || [];
  }, [activeTemplate]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      department: activeTemplate.department,
      flightNumber: activeTemplate.hideFlightNumber
        ? ""
        : prev.flightNumber,
      responses: buildInitialResponses(activeTemplate.fields || []),
    }));
  }, [activeTemplate]);

  const computedNeedsAttention = useMemo(() => {
    return shouldRequireAttentionFromResponses(form.responses);
  }, [form.responses]);

  const finalNeedsAttention = useMemo(() => {
    return Boolean(form.needsAttention || computedNeedsAttention);
  }, [form.needsAttention, computedNeedsAttention]);

  const overtimeReported = useMemo(() => {
    return hasOvertimeReported(form.responses);
  }, [form.responses]);

  const handleFormChange = (field, value) => {
    if (field === "templateKey") {
      const nextTemplate =
        OPERATIONAL_REPORT_TEMPLATES[value] ||
        OPERATIONAL_REPORT_TEMPLATES.passenger_service;

      setForm((prev) => ({
        ...prev,
        templateKey: nextTemplate.key,
        department: nextTemplate.department,
        airline: nextTemplate.airlineDefault || "",
        flightNumber: nextTemplate.hideFlightNumber
          ? ""
          : prev.flightNumber,
        responses: buildInitialResponses(nextTemplate.fields || []),
      }));

      return;
    }

    if (field === "hasLobs") {
      setForm((prev) => ({
        ...prev,
        hasLobs: Boolean(value),
        lobBagCount: value ? prev.lobBagCount : "",
        lobAgentsUsed: value ? prev.lobAgentsUsed : "",
        lobSupervisorsUsed: value ? prev.lobSupervisorsUsed : "",
      }));
      return;
    }

    if (isCabinServiceUser && field === "department") {
      setForm((prev) => ({
        ...prev,
        department: "Cabin Service",
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleResponseChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  const handleCheckboxGroupChange = (key, option, checked) => {
    setForm((prev) => {
      const current = Array.isArray(prev.responses?.[key])
        ? prev.responses[key]
        : [];

      let next;

      if (checked) {
        next = [...current, option];
      } else {
        next = current.filter((item) => item !== option);
      }

      return {
        ...prev,
        responses: {
          ...(prev.responses || {}),
          [key]: next,
        },
      };
    });
  };

  const validateRequiredFields = () => {
    if (!form.airline) {
      setStatusMessage("Please select the reporting airline.");
      return false;
    }

    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return false;
    }

    for (const field of dynamicFields) {
      if (!field.required) continue;

      const value = form.responses?.[field.key];

      if (field.type === "checkbox-group") {
        if (!Array.isArray(value) || value.length === 0) {
          setStatusMessage(
            `Please complete the required field: ${field.label}.`
          );
          return false;
        }
        continue;
      }

      if (String(value ?? "").trim() === "") {
        setStatusMessage(
          `Please complete the required field: ${field.label}.`
        );
        return false;
      }
    }

    if (form.hasLobs) {
      const lobBagCount = Number(form.lobBagCount);
      const lobAgentsUsed = Number(form.lobAgentsUsed);
      const lobSupervisorsUsed = Number(form.lobSupervisorsUsed);

      if (
        String(form.lobBagCount ?? "").trim() === "" ||
        !Number.isFinite(lobBagCount) ||
        lobBagCount <= 0
      ) {
        setStatusMessage("Please enter a valid total number of LOB bags.");
        return false;
      }

      if (
        String(form.lobAgentsUsed ?? "").trim() === "" ||
        !Number.isFinite(lobAgentsUsed) ||
        lobAgentsUsed < 0
      ) {
        setStatusMessage("Please enter the number of agents used for LOBs.");
        return false;
      }

      if (
        String(form.lobSupervisorsUsed ?? "").trim() === "" ||
        !Number.isFinite(lobSupervisorsUsed) ||
        lobSupervisorsUsed < 0
      ) {
        setStatusMessage(
          "Please enter the number of supervisors used for LOBs."
        );
        return false;
      }

      if (lobAgentsUsed === 0 && lobSupervisorsUsed === 0) {
        setStatusMessage(
          "Please enter at least one agent or supervisor used for the LOB operation."
        );
        return false;
      }
    }

    if (form.delayedFlight) {
      if (!String(form.delayedTimeMinutes || "").trim()) {
        setStatusMessage("Please enter the delayed time in minutes.");
        return false;
      }

      if (!String(form.delayedReason || "").trim()) {
        setStatusMessage("Please enter the delayed reason.");
        return false;
      }

      if (!String(form.delayedCodeReported || "").trim()) {
        setStatusMessage(
          "Please enter the delayed code reported to the airline."
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!validateRequiredFields()) return;

    try {
      setSaving(true);

      const payload = {
        templateKey: activeTemplate.key,
        templateLabel: activeTemplate.label,
        airline: normalizeAirlineName(form.airline),
        reportDate: form.reportDate,
        department: String(form.department || "").trim(),
        shift: String(form.shift || "").trim(),
        flightNumber: activeTemplate.hideFlightNumber
          ? ""
          : String(form.flightNumber || "").trim(),
        flightsHandled: String(form.flightsHandled || "").trim(),
        supervisorReporting:
          String(form.supervisorReporting || "").trim() ||
          getVisibleName(user),
        supervisorPosition:
          String(form.supervisorPosition || "").trim() ||
          user?.position ||
          getDefaultPosition(user?.role),
        notes: String(form.notes || "").trim(),
        delayedFlight: Boolean(form.delayedFlight),
        delayedTimeMinutes: form.delayedFlight
          ? Number(form.delayedTimeMinutes || 0)
          : 0,
        delayedReason: form.delayedFlight
          ? String(form.delayedReason || "").trim()
          : "",
        delayedCodeReported: form.delayedFlight
          ? String(form.delayedCodeReported || "").trim()
          : "",
        hasLobs: Boolean(form.hasLobs),
        lobBagCount: form.hasLobs
          ? Number(form.lobBagCount || 0)
          : 0,
        lobAgentsUsed: form.hasLobs
          ? Number(form.lobAgentsUsed || 0)
          : 0,
        lobSupervisorsUsed: form.hasLobs
          ? Number(form.lobSupervisorsUsed || 0)
          : 0,
        overtimeReported: Boolean(overtimeReported),
        needsAttention: finalNeedsAttention,
        responses: form.responses || {},
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        createdAt: serverTimestamp(),
        status: "submitted",
        reviewStatus: "submitted",
      };

      const reportRef = await addDoc(
        collection(db, "operational_reports"),
        payload
      );

      if (form.hasLobs || overtimeReported) {
        try {
          const alertReasons = [];

          if (overtimeReported) {
            alertReasons.push("OVERTIME");
          }

          if (form.hasLobs) {
            alertReasons.push("LOBS");
          }

          const staffingRemarks = String(
            form.responses?.staffing_remarks || ""
          ).trim();

          const lobsText = form.hasLobs
            ? `LOBs: ${Number(form.lobBagCount || 0)} bag(s), ${Number(
                form.lobAgentsUsed || 0
              )} agent(s), ${Number(
                form.lobSupervisorsUsed || 0
              )} supervisor(s).`
            : "";

          const overtimeText = overtimeReported
            ? staffingRemarks
              ? `Overtime reported. Staffing remarks: ${staffingRemarks}`
              : "Overtime was reported in Staffing Status."
            : "";

          const title =
            form.hasLobs && overtimeReported
              ? "Operational Report: Overtime & LOBs"
              : form.hasLobs
              ? "Operational Report: LOBs Reported"
              : "Operational Report: Overtime Reported";

          const message = [
            `${activeTemplate.label} report requires management awareness.`,
            overtimeText,
            lobsText,
            `Airline: ${normalizeAirlineName(form.airline)}.`,
            activeTemplate.hideFlightNumber
              ? ""
              : `Flight: ${String(form.flightNumber || "N/A").trim()}.`,
            `Reported by: ${String(
              form.supervisorReporting || getVisibleName(user)
            ).trim()}.`,
          ]
            .filter(Boolean)
            .join(" ");

          await createOperationalAlert({
            alertType:
              form.hasLobs && overtimeReported
                ? "OPERATIONAL_REPORT_OVERTIME_AND_LOBS"
                : form.hasLobs
                ? "OPERATIONAL_REPORT_LOBS"
                : "OPERATIONAL_REPORT_OVERTIME",
            category: "OPERATIONAL_REPORT",
            severity: "HIGH",
            priority: "URGENT",
            title,
            message,
            source: "SupervisorOperationalReportPage",
            sourceId: reportRef.id,
            airline: normalizeAirlineName(form.airline),
            department: String(form.department || "").trim(),
            reportDate: form.reportDate,
            targetRoles: ["station_manager", "duty_manager"],
            createdByUserId: user?.id || "",
            createdByUsername: user?.username || "",
            createdByName: getVisibleName(user),
            createdByRole: user?.role || "",
            metadata: {
              operationalReportId: reportRef.id,
              templateKey: activeTemplate.key,
              templateLabel: activeTemplate.label,
              airline: normalizeAirlineName(form.airline),
              department: String(form.department || "").trim(),
              reportDate: form.reportDate,
              shift: String(form.shift || "").trim(),
              flightNumber: activeTemplate.hideFlightNumber
                ? ""
                : String(form.flightNumber || "").trim(),
              alertReasons,
              overtimeReported: Boolean(overtimeReported),
              staffingStatus: Array.isArray(
                form.responses?.staffing_status
              )
                ? form.responses.staffing_status
                : [],
              staffingRemarks,
              hasLobs: Boolean(form.hasLobs),
              lobBagCount: form.hasLobs
                ? Number(form.lobBagCount || 0)
                : 0,
              lobAgentsUsed: form.hasLobs
                ? Number(form.lobAgentsUsed || 0)
                : 0,
              lobSupervisorsUsed: form.hasLobs
                ? Number(form.lobSupervisorsUsed || 0)
                : 0,
              supervisorReporting:
                String(form.supervisorReporting || "").trim() ||
                getVisibleName(user),
            },
          });
        } catch (alertErr) {
          console.error(
            "Operational Report alert error:",
            alertErr
          );
        }
      }

      setStatusMessage(
        "Operational report submitted successfully."
      );

      setForm({
        templateKey: defaultTemplateKey,
        airline:
          OPERATIONAL_REPORT_TEMPLATES[
            defaultTemplateKey
          ]?.airlineDefault || "",
        reportDate: "",
        department:
          OPERATIONAL_REPORT_TEMPLATES[
            defaultTemplateKey
          ]?.department || "",
        shift: "",
        flightNumber: "",
        flightsHandled: "",
        supervisorReporting: getVisibleName(user),
        supervisorPosition:
          user?.position || getDefaultPosition(user?.role),
        notes: "",
        delayedFlight: false,
        delayedTimeMinutes: "",
        delayedReason: "",
        delayedCodeReported: "",
        hasLobs: false,
        lobBagCount: "",
        lobAgentsUsed: "",
        lobSupervisorsUsed: "",
        needsAttention: false,
        responses: buildInitialResponses(
          OPERATIONAL_REPORT_TEMPLATES[
            defaultTemplateKey
          ]?.fields || []
        ),
      });
    } catch (err) {
      console.error("Error saving operational report:", err);
      setStatusMessage("Could not submit operational report.");
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
            padding: isMobile ? "14px" : "18px 20px",
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
              fontWeight: 800,
            }}
          >
            {APP_NAME} {"\u00B7"} Operational Reports
          </p>

          <h1
            style={{
              margin: isMobile ? "6px 0 4px" : "8px 0 5px",
              fontSize: isMobile ? 21 : 25,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: "-0.035em",
            }}
          >
            Access denied
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 11.5 : 12.5,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            You do not have permission to submit operational reports.
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
            flexWrap: "wrap",
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
                {APP_NAME} {"\u00B7"} Operational Reports
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
              Submit Operational Report
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
              Department-based operational reporting with automatic management
              alerts for overtime and LOBs.
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
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              background: statusMessage.toLowerCase().includes("could not") ||
                statusMessage.toLowerCase().includes("please")
                ? "#fff1f2"
                : "#ecfdf5",
              border: statusMessage.toLowerCase().includes("could not") ||
                statusMessage.toLowerCase().includes("please")
                ? "1px solid #fecdd3"
                : "1px solid #a7f3d0",
              borderRadius: 14,
              padding: "12px 14px",
              color: statusMessage.toLowerCase().includes("could not") ||
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
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Report Header
          </h2>
        </div>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Department / Report Type</FieldLabel>
            <SelectInput
              value={form.templateKey}
              onChange={(e) =>
                handleFormChange("templateKey", e.target.value)
              }
            >
              <option value="baggage">Baggage Handling</option>
              <option value="wchr">WCHR Service</option>
              <option value="cabin_service">Cabin Service</option>
              <option value="passenger_service">Passenger Service</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Reporting Airline</FieldLabel>
            <SelectInput
              value={form.airline}
              onChange={(e) =>
                handleFormChange("airline", e.target.value)
              }
            >
              <option value="">Select airline</option>
              {AIRLINE_OPTIONS.map((airline) => (
                <option key={airline.value} value={airline.value}>
                  {airline.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.reportDate}
              onChange={(e) =>
                handleFormChange("reportDate", e.target.value)
              }
            />
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={form.department}
              onChange={(e) =>
                handleFormChange("department", e.target.value)
              }
              disabled
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <TextInput
              value={form.shift}
              onChange={(e) =>
                handleFormChange("shift", e.target.value)
              }
              placeholder="AM / PM / MID"
            />
          </div>

          {!activeTemplate.hideFlightNumber && (
            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={form.flightNumber}
                onChange={(e) =>
                  handleFormChange("flightNumber", e.target.value)
                }
                placeholder="Example: WL294"
              />
            </div>
          )}

          <div>
            <FieldLabel>
              {activeTemplate.key === "cabin_service"
                ? "Flights Serviced"
                : "Flights Handled"}
            </FieldLabel>
            <TextInput
              value={form.flightsHandled}
              onChange={(e) =>
                handleFormChange("flightsHandled", e.target.value)
              }
              placeholder="Example: 4"
            />
          </div>

          <div>
            <FieldLabel>Supervisor (Name)</FieldLabel>
            <TextInput
              value={form.supervisorReporting}
              onChange={(e) =>
                handleFormChange("supervisorReporting", e.target.value)
              }
            />
          </div>
        </div>
      </PageCard>

      <PageCard
        style={{
          padding: isMobile ? 14 : 20,
          border: form.hasLobs
            ? "1px solid #fdba74"
            : "1px solid #e2e8f0",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
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
              LOBs Information
            </h2>

            {form.hasLobs && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 999,
                  padding: "5px 9px",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#c2410c",
                  fontSize: 10.5,
                  fontWeight: 900,
                }}
              >
                LOBS REPORTED
              </span>
            )}
          </div>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            Reporting LOBs will automatically create an urgent management alert.
          </p>
        </div>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Did this flight have LOBs?</FieldLabel>
            <SelectInput
              value={form.hasLobs ? "Yes" : "No"}
              onChange={(e) =>
                handleFormChange(
                  "hasLobs",
                  e.target.value === "Yes"
                )
              }
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </SelectInput>
          </div>

          {form.hasLobs && (
            <>
              <div>
                <FieldLabel>Total LOB Bags *</FieldLabel>
                <TextInput
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.lobBagCount}
                  onChange={(e) =>
                    handleFormChange("lobBagCount", e.target.value)
                  }
                  placeholder="Example: 80"
                />
              </div>

              <div>
                <FieldLabel>Agents Used *</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.lobAgentsUsed}
                  onChange={(e) =>
                    handleFormChange("lobAgentsUsed", e.target.value)
                  }
                  placeholder="Example: 4"
                />
              </div>

              <div>
                <FieldLabel>Supervisors Used *</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.lobSupervisorsUsed}
                  onChange={(e) =>
                    handleFormChange(
                      "lobSupervisorsUsed",
                      e.target.value
                    )
                  }
                  placeholder="Example: 1"
                />
              </div>
            </>
          )}
        </div>

        {form.hasLobs && (
          <div
            style={{
              marginTop: 14,
              padding: 13,
              borderRadius: 14,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: "#9a3412",
                textTransform: "uppercase",
              }}
            >
              LOB Summary
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 13,
                color: "#7c2d12",
                fontWeight: 700,
                lineHeight: 1.55,
              }}
            >
              {form.lobBagCount || "0"} bag(s) {"\u00B7"}{" "}
              {form.lobAgentsUsed || "0"} agent(s) {"\u00B7"}{" "}
              {form.lobSupervisorsUsed || "0"} supervisor(s)
            </div>
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
          Delay Information
        </h2>

        <div style={gridStyle}>
          <div>
            <FieldLabel>Delayed Flight</FieldLabel>
            <SelectInput
              value={form.delayedFlight ? "Yes" : "No"}
              onChange={(e) =>
                handleFormChange(
                  "delayedFlight",
                  e.target.value === "Yes"
                )
              }
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </SelectInput>
          </div>

          {form.delayedFlight && (
            <>
              <div>
                <FieldLabel>Delayed Time (minutes)</FieldLabel>
                <TextInput
                  type="number"
                  value={form.delayedTimeMinutes}
                  onChange={(e) =>
                    handleFormChange(
                      "delayedTimeMinutes",
                      e.target.value
                    )
                  }
                  placeholder="Example: 7"
                />
              </div>

              <div>
                <FieldLabel>Delayed Code Reported to the Airline</FieldLabel>
                <TextInput
                  value={form.delayedCodeReported}
                  onChange={(e) =>
                    handleFormChange(
                      "delayedCodeReported",
                      e.target.value
                    )
                  }
                  placeholder="Example: MX / WX / OPS"
                />
              </div>
            </>
          )}
        </div>

        {form.delayedFlight && (
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Delayed Reason</FieldLabel>
            <TextArea
              value={form.delayedReason}
              onChange={(e) =>
                handleFormChange("delayedReason", e.target.value)
              }
              placeholder="Explain the delayed reason"
            />
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {activeTemplate.label} Questions
          </h2>
        </div>

        <div style={{ display: "grid", gap: isMobile ? 12 : 16 }}>
          {dynamicFields.map((field) => {
            const value = form.responses?.[field.key];

            if (field.type === "textarea") {
              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>
                  <TextArea
                    value={String(value || "")}
                    onChange={(e) =>
                      handleResponseChange(field.key, e.target.value)
                    }
                  />
                </div>
              );
            }

            if (field.type === "select") {
              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>
                  <SelectInput
                    value={String(value || "")}
                    onChange={(e) =>
                      handleResponseChange(field.key, e.target.value)
                    }
                  >
                    <option value="">Select option</option>
                    {(field.options || []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              );
            }

            if (field.type === "yesno") {
              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>
                  <SelectInput
                    value={String(value || "")}
                    onChange={(e) =>
                      handleResponseChange(field.key, e.target.value)
                    }
                  >
                    <option value="">Select option</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </SelectInput>
                </div>
              );
            }

            if (field.type === "checkbox-group") {
              const selected = Array.isArray(value)
                ? value
                : [];

              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 8,
                      background: field.key === "staffing_status" &&
                        overtimeReported
                        ? "#fff7ed"
                        : "#f8fbff",
                      border: field.key === "staffing_status" &&
                        overtimeReported
                        ? "1px solid #fdba74"
                        : "1px solid #dbeafe",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    {(field.options || []).map((option) => (
                      <label
                        key={option}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#0f172a",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(option)}
                          onChange={(e) =>
                            handleCheckboxGroupChange(
                              field.key,
                              option,
                              e.target.checked
                            )
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>

                  {field.key === "staffing_status" &&
                    overtimeReported && (
                      <div
                        style={{
                          marginTop: 8,
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          color: "#9a3412",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        Overtime selected. An urgent management alert will be
                        created when this report is submitted.
                      </div>
                    )}
                </div>
              );
            }

            return (
              <div key={field.key}>
                <FieldLabel>
                  {field.label} {field.required ? "*" : ""}
                </FieldLabel>
                <TextInput
                  value={String(value || "")}
                  onChange={(e) =>
                    handleResponseChange(field.key, e.target.value)
                  }
                />
              </div>
            );
          })}
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
          Notes and Attention
        </h2>

        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={form.notes}
            onChange={(e) =>
              handleFormChange("notes", e.target.value)
            }
            placeholder="Additional operational notes"
          />
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              color: "#0f172a",
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={form.needsAttention}
              onChange={(e) =>
                handleFormChange(
                  "needsAttention",
                  e.target.checked
                )
              }
            />
            Mark report as Needs Attention
          </label>

          {computedNeedsAttention && (
            <div
              style={{
                borderRadius: 14,
                padding: "12px 14px",
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                fontWeight: 800,
                fontSize: 12.5,
              }}
            >
              This report will be flagged because the selected responses indicate
              an issue, delay, safety concern, or incomplete operation.
            </div>
          )}
        </div>
      </PageCard>

      {(form.hasLobs || overtimeReported) && (
        <PageCard
          style={{
            padding: isMobile ? 14 : 18,
            border: "1px solid #fdba74",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: "#9a3412",
            }}
          >
            Management Alert Will Be Created
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 12.5,
              color: "#7c2d12",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {overtimeReported && "Overtime reported. "}
            {form.hasLobs &&
              `${form.lobBagCount || "0"} LOB bag(s), ${
                form.lobAgentsUsed || "0"
              } agent(s), and ${
                form.lobSupervisorsUsed || "0"
              } supervisor(s) reported.`}
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
            disabled={saving}
          >
            {saving
              ? "Submitting..."
              : "Submit Operational Report"}
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
            disabled={saving}
          >
            Cancel
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
