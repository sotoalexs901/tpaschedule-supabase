import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();

  if (
    airline.toUpperCase() === "WL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA" ||
    airline.toUpperCase() === "WESTJET"
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
  const operationStatus = String(responses?.operation_status || "").toLowerCase();
  const safetyConcern = String(responses?.safety_concern || "").toLowerCase();
  const delayedFlight =
    String(responses?.delayed_flight || "").toLowerCase() === "yes" ||
    String(responses?.delayed_flight_impact || "").toLowerCase() === "yes";

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
        minHeight: 100,
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
    active: true,
    order: 1,
  },
  {
    key: "general_comments",
    label: "General Comments",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 2,
  },
  {
    key: "issue_types",
    label: "Issue Types (select all that apply)",
    type: "checkbox-group",
    required: false,
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
    active: true,
    order: 3,
  },
  {
    key: "issue_details",
    label: "Issue Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 4,
  },
  {
    key: "action_taken",
    label: "Action Taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 5,
  },
  {
    key: "issue_status",
    label: "Status",
    type: "select",
    required: false,
    options: ["N/A", "Resolved", "Pending", "Escalated"],
    active: true,
    order: 6,
  },
  {
    key: "oh_bags_total_quantity",
    label: "OH Bags Total Quantity",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 7,
  },
  {
    key: "oh_bags_affected_flights",
    label: "OH Bags Affected Flights",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 8,
  },
  {
    key: "oh_bags_details",
    label: "OH Bags Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 9,
  },
  {
    key: "oh_bags_follow_up_actions",
    label: "OH Bags Follow-up Actions",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 10,
  },
  {
    key: "pending_item_1",
    label: "Pending Item 1",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 11,
  },
  {
    key: "pending_description",
    label: "Pending Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
  },
  {
    key: "pending_responsible",
    label: "Pending Responsible",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 13,
  },
  {
    key: "pending_target_date",
    label: "Pending Target Date",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 14,
  },
  {
    key: "exception_type",
    label: "Exception Type (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["N/A", "Operational", "Staffing", "Safety", "Baggage", "Other"],
    active: true,
    order: 15,
  },
  {
    key: "exception_description",
    label: "Exception Description",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 16,
  },
  {
    key: "exception_reason",
    label: "Exception Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 17,
  },
  {
    key: "exception_reported_to",
    label: "Reported To",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 18,
  },
  {
    key: "staffing_status",
    label: "Staffing Status (select all that apply)",
    type: "checkbox-group",
    required: false,
    options: ["Full staffing", "Short staffed", "Overtime needed", "Call out", "Other"],
    active: true,
    order: 19,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 20,
  },
  {
    key: "employees_breaks",
    label: "Employees Breaks",
    type: "select",
    required: false,
    options: [
      "All agents have taken their scheduled break",
      "Not all agents have taken their scheduled break",
    ],
    active: true,
    order: 21,
  },
  {
    key: "employees_no_break_taken",
    label: "Name of Employees / No Break taken",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 22,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 23,
  },
];

const WCHR_FIELDS = [
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
    active: true,
    order: 1,
  },
  {
    key: "wchr_requests_handled",
    label: "WCHR Requests Handled",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 2,
  },
  {
    key: "gate_to_gate_coordination",
    label: "Gate to Gate Coordination Completed?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 3,
  },
  {
    key: "wheelchair_availability",
    label: "Wheelchair Availability Status",
    type: "select",
    required: false,
    options: ["Adequate", "Limited", "Insufficient"],
    active: true,
    order: 4,
  },
  {
    key: "escort_delays",
    label: "Any Escort Delays?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 5,
  },
  {
    key: "escort_delay_details",
    label: "Escort Delay Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 6,
  },
  {
    key: "missed_wchr_requests",
    label: "Any Missed WCHR Requests?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 7,
  },
  {
    key: "missed_wchr_details",
    label: "Missed WCHR Request Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 8,
  },
  {
    key: "passenger_complaints",
    label: "Passenger Complaints?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 9,
  },
  {
    key: "passenger_complaint_details",
    label: "Passenger Complaint Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 10,
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    required: false,
    options: ["Full staffing", "Short staffed", "Overtime needed", "Call out", "Other"],
    active: true,
    order: 11,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
  },
  {
    key: "safety_concern",
    label: "Any Safety Concern?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 13,
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 14,
  },
  {
    key: "delayed_flight",
    label: "Any Delayed Flight?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 15,
  },
  {
    key: "delayed_flight_minutes",
    label: "Delayed Minutes",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 16,
  },
  {
    key: "delayed_flight_reason",
    label: "Delayed Flight Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 17,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 18,
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
    active: true,
    order: 1,
  },
  {
    key: "flights_serviced",
    label: "Flights Serviced",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 2,
  },
  {
    key: "aircraft_tail_numbers",
    label: "Aircraft Tail Number(s)",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 3,
  },
  {
    key: "cabin_cleaning_completed",
    label: "Cabin Cleaning Completed?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 4,
  },
  {
    key: "lavatories_serviced",
    label: "Lavatories Serviced?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 5,
  },
  {
    key: "galleys_cleaned_stock_checked",
    label: "Galleys Cleaned / Stock Checked?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 6,
  },
  {
    key: "seat_pockets_trays_checked",
    label: "Seat Pockets / Tray Tables Checked?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 7,
  },
  {
    key: "carpets_cabin_floor_condition",
    label: "Carpets / Cabin Floor Condition",
    type: "select",
    required: false,
    options: ["Good", "Acceptable", "Needs Attention"],
    active: true,
    order: 8,
  },
  {
    key: "trash_removed_correctly",
    label: "Trash Removed Correctly?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 9,
  },
  {
    key: "seatbelt_and_visible_items_checked",
    label: "Seatbelts / Visible Cabin Items Checked?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 10,
  },
  {
    key: "special_cleaning_required",
    label: "Special Cleaning Required?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 11,
  },
  {
    key: "special_cleaning_details",
    label: "Special Cleaning Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
  },
  {
    key: "equipment_or_supply_issues",
    label: "Equipment / Supply Issues?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 13,
  },
  {
    key: "equipment_or_supply_issue_details",
    label: "Equipment / Supply Issue Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 14,
  },
  {
    key: "delayed_flight_impact",
    label: "Was Cabin Service Impacted by a Delay?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 15,
  },
  {
    key: "delay_reason",
    label: "Delay Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 16,
  },
  {
    key: "delay_minutes",
    label: "Delay Minutes",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 17,
  },
  {
    key: "safety_concern",
    label: "Any Safety Concern?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 18,
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 19,
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    required: false,
    options: ["Fully staffed", "Short staffed", "Overtime required", "Call out(s)", "Other"],
    active: true,
    order: 20,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 21,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 22,
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
    active: true,
    order: 1,
  },
  {
    key: "flights_handled",
    label: "Flights Handled",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 2,
  },
  {
    key: "checkin_completed",
    label: "Check-in Operation Completed?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 3,
  },
  {
    key: "boarding_completed",
    label: "Boarding Operation Completed?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 4,
  },
  {
    key: "document_checks_completed",
    label: "Passenger Document Checks Completed?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 5,
  },
  {
    key: "special_assistance_handled",
    label: "Special Assistance Requests Handled Properly?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 6,
  },
  {
    key: "oversize_or_special_bag_issues",
    label: "Oversize / Special Bag Issues?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 7,
  },
  {
    key: "oversize_or_special_bag_details",
    label: "Oversize / Special Bag Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 8,
  },
  {
    key: "boarding_gate_change",
    label: "Any Gate Change?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 9,
  },
  {
    key: "gate_change_details",
    label: "Gate Change Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 10,
  },
  {
    key: "standby_upgrade_irregularities",
    label: "Standby / Upgrade / Seating Irregularities?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 11,
  },
  {
    key: "standby_upgrade_details",
    label: "Standby / Upgrade Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 12,
  },
  {
    key: "customer_service_issues",
    label: "Customer Service Issues?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 13,
  },
  {
    key: "customer_service_issue_details",
    label: "Customer Service Issue Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 14,
  },
  {
    key: "delayed_flight",
    label: "Any Delayed Flight?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 15,
  },
  {
    key: "delayed_flight_minutes",
    label: "Delayed Minutes",
    type: "text",
    required: false,
    options: [],
    active: true,
    order: 16,
  },
  {
    key: "delayed_flight_reason",
    label: "Delayed Flight Reason",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 17,
  },
  {
    key: "safety_concern",
    label: "Any Safety Concern?",
    type: "yesno",
    required: false,
    options: ["Yes", "No"],
    active: true,
    order: 18,
  },
  {
    key: "safety_concern_details",
    label: "Safety Concern Details",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 19,
  },
  {
    key: "staffing_status",
    label: "Staffing Status",
    type: "checkbox-group",
    required: false,
    options: ["Fully staffed", "Short staffed", "Overtime required", "Call out(s)", "Other"],
    active: true,
    order: 20,
  },
  {
    key: "staffing_remarks",
    label: "Staffing Remarks",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 21,
  },
  {
    key: "final_remarks_recommendations",
    label: "Final Remarks / Recommendations",
    type: "textarea",
    required: false,
    options: [],
    active: true,
    order: 22,
  },
];

const OPERATIONAL_REPORT_TEMPLATES = {
  baggage: {
    key: "baggage",
    label: "Baggage Handling",
    department: "Baggage Handling",
    airlineDefault: "",
    fields: BAGGAGE_FIELDS,
  },
  wchr: {
    key: "wchr",
    label: "WCHR Service",
    department: "WCHR Service",
    airlineDefault: "WCHR",
    fields: WCHR_FIELDS,
  },
  cabin_service: {
    key: "cabin_service",
    label: "Cabin Service",
    department: "Cabin Service",
    airlineDefault: "",
    fields: CABIN_SERVICE_FIELDS,
  },
  passenger_service: {
    key: "passenger_service",
    label: "Passenger Service",
    department: "Passenger Service",
    airlineDefault: "",
    fields: PASSENGER_SERVICE_FIELDS,
  },
};

export default function SupervisorOperationalReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();

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
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "",
    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",
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
      airline:
        prev.templateKey === form.templateKey
          ? prev.airline
          : activeTemplate.airlineDefault || "",
      responses: buildInitialResponses(activeTemplate.fields || []),
    }));
  }, [activeTemplate, form.templateKey]);

  const computedNeedsAttention = useMemo(() => {
    return shouldRequireAttentionFromResponses(form.responses);
  }, [form.responses]);

  const finalNeedsAttention = useMemo(() => {
    return Boolean(form.needsAttention || computedNeedsAttention);
  }, [form.needsAttention, computedNeedsAttention]);

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
        responses: buildInitialResponses(nextTemplate.fields || []),
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
      const current = Array.isArray(prev.responses?.[key]) ? prev.responses[key] : [];
      const next = checked
        ? [...current, option]
        : current.filter((item) => item !== option);

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
          setStatusMessage(`Please complete the required field: ${field.label}.`);
          return false;
        }
        continue;
      }

      if (String(value ?? "").trim() === "") {
        setStatusMessage(`Please complete the required field: ${field.label}.`);
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
        setStatusMessage("Please enter the delayed code reported to the airline.");
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
        flightNumber: String(form.flightNumber || "").trim(),
        flightsHandled: String(form.flightsHandled || "").trim(),
        supervisorReporting:
          String(form.supervisorReporting || "").trim() || getVisibleName(user),
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

      await addDoc(collection(db, "operational_reports"), payload);

      setStatusMessage("Operational report submitted successfully.");

      setForm({
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
        supervisorPosition: user?.position || getDefaultPosition(user?.role),
        notes: "",
        delayedFlight: false,
        delayedTimeMinutes: "",
        delayedReason: "",
        delayedCodeReported: "",
        needsAttention: false,
        responses: buildInitialResponses(
          OPERATIONAL_REPORT_TEMPLATES[defaultTemplateKey]?.fields || []
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
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
            TPA OPS · Operational Reports
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
            You do not have permission to submit operational reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
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
              TPA OPS · Operational Reports
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
              Submit Operational Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Submit the operational report by department. Questions change automatically based on the selected operational area.
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
            Report Header
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Complete the main report information first.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Department / Report Type</FieldLabel>
            <SelectInput
              value={form.templateKey}
              onChange={(e) => handleFormChange("templateKey", e.target.value)}
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
              onChange={(e) => handleFormChange("airline", e.target.value)}
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
              onChange={(e) => handleFormChange("reportDate", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={form.department}
              onChange={(e) => handleFormChange("department", e.target.value)}
              disabled
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <TextInput
              value={form.shift}
              onChange={(e) => handleFormChange("shift", e.target.value)}
              placeholder="AM / PM / MID"
            />
          </div>

          <div>
            <FieldLabel>Flight Number</FieldLabel>
            <TextInput
              value={form.flightNumber}
              onChange={(e) => handleFormChange("flightNumber", e.target.value)}
              placeholder="Example: DL1234"
            />
          </div>

          <div>
            <FieldLabel>Flights Handled</FieldLabel>
            <TextInput
              value={form.flightsHandled}
              onChange={(e) => handleFormChange("flightsHandled", e.target.value)}
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
            Delay Information
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Delayed Flight</FieldLabel>
            <SelectInput
              value={form.delayedFlight ? "Yes" : "No"}
              onChange={(e) =>
                handleFormChange("delayedFlight", e.target.value === "Yes")
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
                    handleFormChange("delayedTimeMinutes", e.target.value)
                  }
                  placeholder="Example: 7"
                />
              </div>

              <div>
                <FieldLabel>Delayed Code Reported to the Airline</FieldLabel>
                <TextInput
                  value={form.delayedCodeReported}
                  onChange={(e) =>
                    handleFormChange("delayedCodeReported", e.target.value)
                  }
                  placeholder="Example: MX / WX / OPS"
                />
              </div>
            </>
          )}
        </div>

        {form.delayedFlight && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>Delayed Reason</FieldLabel>
            <TextArea
              value={form.delayedReason}
              onChange={(e) => handleFormChange("delayedReason", e.target.value)}
              placeholder="Explain the delayed reason"
            />
          </div>
        )}
      </PageCard>

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
            {activeTemplate.label} Questions
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            These questions are shown according to the selected department.
          </p>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
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
              const selected = Array.isArray(value) ? value : [];

              return (
                <div key={field.key}>
                  <FieldLabel>
                    {field.label} {field.required ? "*" : ""}
                  </FieldLabel>
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    {(field.options || []).map((option) => (
                      <label
                        key={option}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          color: "#0f172a",
                          fontWeight: 600,
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

      <PageCard style={{ padding: 22 }}>
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
            Notes and Attention
          </h2>
        </div>

        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={form.notes}
            onChange={(e) => handleFormChange("notes", e.target.value)}
            placeholder="Additional operational notes"
          />
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            <input
              type="checkbox"
              checked={form.needsAttention}
              onChange={(e) => handleFormChange("needsAttention", e.target.checked)}
            />
            Mark report as Needs Attention
          </label>

          {computedNeedsAttention && (
            <div
              style={{
                borderRadius: 16,
                padding: "14px 16px",
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              Attention alert: this report will be flagged because the selected responses indicate an issue, delay, safety concern, or incomplete operation.
            </div>
          )}
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleSubmit}
            variant="primary"
            disabled={saving}
          >
            {saving ? "Submitting..." : "Submit Operational Report"}
          </ActionButton>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
            Cancel
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}
