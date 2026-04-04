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

const INSPECTION_ITEMS = [
  "Check wheelchair frame and structure for cracks, bends, or visible damage.",
  "Inspect wheelchair for sharp edges, loose parts, or missing components.",
  "Check condition of rear wheels and front caster wheels. Ensure they rotate freely and are not damaged.",
  "Verify that wheel locks/brakes are operational and securely hold the wheelchair in place.",
  "Check that footrests are secure, properly attached, and move freely.",
  "Ensure armrests are secure and in good condition.",
  "Inspect seat and backrest for tears, excessive wear, or instability.",
  "Verify that seatbelt (if installed) is present and functioning properly.",
  "Ensure handles used to push the wheelchair are secure and not loose.",
  "Check that the wheelchair rolls smoothly and turns properly.",
  "Verify the wheelchair is clean.",
  "Ensure wheelchair identification number/tag is present and visible.",
];

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

function normalizeUnitList(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function isAlertReport(report) {
  const anyInop = String(report?.anyInopWchr || "").toLowerCase() === "yes";
  const hasOutOfServiceUnits = normalizeUnitList(report?.outOfServiceUnits).length > 0;

  const inspectionResults = Array.isArray(report?.inspectionResults)
    ? report.inspectionResults
    : [];

  const hasFailedChecks = inspectionResults.some(
    (item) => String(item?.result || "").toLowerCase() === "no"
  );

  return anyInop || hasOutOfServiceUnits || hasFailedChecks;
}

function buildUnitCasesFromReport(report) {
  const units = normalizeUnitList(report?.outOfServiceUnits);
  return units.map((unit) => ({
    unitNumber: unit,
    reportId: report.id,
    reportDate: report.date || "",
    reportTime: report.time || "",
    location: report.location || "",
    inspectorName: report.inspectorName || "",
    damageDetails: report.damageDetails || "",
    photoNotes: report.photoNotes || "",
    takenBy: report?.maintenanceCase?.[unit]?.takenBy || "",
    caseStatus: report?.maintenanceCase?.[unit]?.caseStatus || "open",
    backOnService: report?.maintenanceCase?.[unit]?.backOnService || "no",
    returnDate: report?.maintenanceCase?.[unit]?.returnDate || "",
    workPerformed: report?.maintenanceCase?.[unit]?.workPerformed || "",
    partsChanged: report?.maintenanceCase?.[unit]?.partsChanged || "",
    maintenanceCost: report?.maintenanceCase?.[unit]?.maintenanceCost || "",
    notes: report?.maintenanceCase?.[unit]?.notes || "",
    closedBy: report?.maintenanceCase?.[unit]?.closedBy || "",
    closedAt: report?.maintenanceCase?.[unit]?.closedAt || "",
  }));
}

export default function WchrPoiReportsAdminPage() {
  const { user } = useUser();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [archivingId, setArchivingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [savingEditId, setSavingEditId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const [selectedUnitCase, setSelectedUnitCase] = useState(null);
  const [savingUnitCase, setSavingUnitCase] = useState(false);

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    location: "all",
    alertsOnly: "all",
    maintenanceStatus: "all",
    search: "",
  });

  const [editData, setEditData] = useState({
    inspectorName: "",
    date: "",
    time: "",
    location: "",
    totalInventory: "",
    unitNumbersInspected: "",
    totalWchrsInspected: "",
    totalWchrsAvailable: "",
    anyInopWchr: "no",
    outOfServiceUnits: "",
    damageDetails: "",
    photoNotes: "",
    inspectorSignature: "",
    inspectionResults: [],
    status: "submitted",
  });

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  useEffect(() => {
    async function loadData() {
      try {
        const qReports = query(
          collection(db, "wchr_poi_reports"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(qReports);
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        setStatusMessage("Could not load WCHR POI reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) loadData();
    else setLoading(false);
  }, [canAccess]);

  const visibleReports = useMemo(() => {
    return reports.filter((item) => !item.archived).filter((item) => {
      if (filters.dateFrom && String(item.date || "") < filters.dateFrom) {
        return false;
      }

      if (filters.dateTo && String(item.date || "") > filters.dateTo) {
        return false;
      }

      if (
        filters.location !== "all" &&
        String(item.location || "").toLowerCase() !==
          filters.location.toLowerCase()
      ) {
        return false;
      }

      const alert = isAlertReport(item);
      if (filters.alertsOnly === "alerts" && !alert) return false;
      if (filters.alertsOnly === "normal" && alert) return false;

      const haystack = [
        item.inspectorName,
        item.date,
        item.time,
        item.location,
        item.unitNumbersInspected,
        item.outOfServiceUnits,
        item.damageDetails,
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
  }, [reports, filters]);

  const alertReports = useMemo(() => {
    return visibleReports.filter((item) => isAlertReport(item));
  }, [visibleReports]);

  const normalReports = useMemo(() => {
    return visibleReports.filter((item) => !isAlertReport(item));
  }, [visibleReports]);

  const unitCases = useMemo(() => {
    const all = alertReports.flatMap(buildUnitCasesFromReport);

    return all.filter((item) => {
      if (filters.maintenanceStatus === "all") return true;
      if (filters.maintenanceStatus === "open") {
        return String(item.caseStatus || "").toLowerCase() !== "closed";
      }
      if (filters.maintenanceStatus === "closed") {
        return String(item.caseStatus || "").toLowerCase() === "closed";
      }
      if (filters.maintenanceStatus === "back_on_service") {
        return String(item.backOnService || "").toLowerCase() === "yes";
      }
      return true;
    });
  }, [alertReports, filters.maintenanceStatus]);

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
        inspectorName: "",
        date: "",
        time: "",
        location: "",
        totalInventory: "",
        unitNumbersInspected: "",
        totalWchrsInspected: "",
        totalWchrsAvailable: "",
        anyInopWchr: "no",
        outOfServiceUnits: "",
        damageDetails: "",
        photoNotes: "",
        inspectorSignature: "",
        inspectionResults: [],
        status: "submitted",
      });
      setIsEditMode(false);
      return;
    }

    setEditData({
      inspectorName: selectedReport.inspectorName || "",
      date: selectedReport.date || "",
      time: selectedReport.time || "",
      location: selectedReport.location || "",
      totalInventory: selectedReport.totalInventory || "",
      unitNumbersInspected: selectedReport.unitNumbersInspected || "",
      totalWchrsInspected: selectedReport.totalWchrsInspected || "",
      totalWchrsAvailable: selectedReport.totalWchrsAvailable || "",
      anyInopWchr: selectedReport.anyInopWchr || "no",
      outOfServiceUnits: selectedReport.outOfServiceUnits || "",
      damageDetails: selectedReport.damageDetails || "",
      photoNotes: selectedReport.photoNotes || "",
      inspectorSignature: selectedReport.inspectorSignature || "",
      inspectionResults: Array.isArray(selectedReport.inspectionResults)
        ? selectedReport.inspectionResults
        : INSPECTION_ITEMS.map((label, index) => ({
            itemNumber: index + 1,
            label,
            result: "yes",
          })),
      status: selectedReport.status || "submitted",
    });
  }, [selectedReport]);

  const handleEditField = (field, value) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleInspectionResultChange = (index, value) => {
    setEditData((prev) => {
      const next = [...prev.inspectionResults];
      next[index] = {
        ...next[index],
        result: value,
      };
      return {
        ...prev,
        inspectionResults: next,
      };
    });
  };

  const handleArchive = async () => {
    if (!selectedReport) return;

    try {
      setArchivingId(selectedReport.id);

      await updateDoc(doc(db, "wchr_poi_reports", selectedReport.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id ? { ...item, archived: true } : item
        )
      );

      setStatusMessage("WCHR POI archived.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not archive WCHR POI.");
    } finally {
      setArchivingId("");
    }
  };

  const handleDelete = async () => {
    if (!selectedReport) return;

    const ok = window.confirm("Delete this WCHR POI permanently?");
    if (!ok) return;

    try {
      setDeletingId(selectedReport.id);

      await deleteDoc(doc(db, "wchr_poi_reports", selectedReport.id));

      setReports((prev) => prev.filter((item) => item.id !== selectedReport.id));
      setStatusMessage("WCHR POI deleted.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not delete WCHR POI.");
    } finally {
      setDeletingId("");
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedReport) return;

    try {
      setSavingEditId(selectedReport.id);

      const unitNumbersList = normalizeUnitList(editData.unitNumbersInspected);

      await updateDoc(doc(db, "wchr_poi_reports", selectedReport.id), {
        ...editData,
        unitNumbersList,
        updatedAt: serverTimestamp(),
        updatedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                ...editData,
                unitNumbersList,
              }
            : item
        )
      );

      setStatusMessage("WCHR POI updated successfully.");
      setIsEditMode(false);
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not save WCHR POI edits.");
    } finally {
      setSavingEditId("");
    }
  };

  const handleOpenUnitCase = (unitCase) => {
    setSelectedUnitCase({ ...unitCase });
  };

  const handleUnitCaseField = (field, value) => {
    setSelectedUnitCase((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveUnitCase = async () => {
    if (!selectedUnitCase) return;

    try {
      setSavingUnitCase(true);

      const reportRef = doc(db, "wchr_poi_reports", selectedUnitCase.reportId);
      const report = reports.find((r) => r.id === selectedUnitCase.reportId);
      const currentMaintenanceCase = report?.maintenanceCase || {};
      const unitKey = selectedUnitCase.unitNumber;

      const nextMaintenanceCase = {
        ...currentMaintenanceCase,
        [unitKey]: {
          takenBy: selectedUnitCase.takenBy || "",
          caseStatus: selectedUnitCase.caseStatus || "open",
          backOnService: selectedUnitCase.backOnService || "no",
          returnDate: selectedUnitCase.returnDate || "",
          workPerformed: selectedUnitCase.workPerformed || "",
          partsChanged: selectedUnitCase.partsChanged || "",
          maintenanceCost: selectedUnitCase.maintenanceCost || "",
          notes: selectedUnitCase.notes || "",
          closedBy:
            selectedUnitCase.caseStatus === "closed"
              ? user?.displayName ||
                user?.fullName ||
                user?.name ||
                user?.username ||
                "Duty Manager"
              : "",
          closedAt:
            selectedUnitCase.caseStatus === "closed"
              ? new Date().toISOString()
              : "",
          updatedAt: new Date().toISOString(),
          updatedBy:
            user?.displayName ||
            user?.fullName ||
            user?.name ||
            user?.username ||
            "Duty Manager",
        },
      };

      await updateDoc(reportRef, {
        maintenanceCase: nextMaintenanceCase,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedUnitCase.reportId
            ? {
                ...item,
                maintenanceCase: nextMaintenanceCase,
              }
            : item
        )
      );

      setStatusMessage(`Case for ${selectedUnitCase.unitNumber} updated.`);
      setSelectedUnitCase(null);
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not save WCHR case.");
    } finally {
      setSavingUnitCase(false);
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
          <title>WCHR POI</title>
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
            .alert {
              background: #fff1f2;
              border: 1px solid #fecdd3;
            }
          </style>
        </head>
        <body>
          <h1>Wheelchairs Pre Operating Inspection (POI)</h1>
          <div class="subtitle">
            ${selectedReport.date || "—"} · ${selectedReport.time || "—"} · ${
      selectedReport.location || "—"
    }
          </div>

          <div class="grid">
            <div class="card"><div class="label">Inspector Name</div><div class="value">${safeValue(
              selectedReport.inspectorName
            )}</div></div>
            <div class="card"><div class="label">Total Inventory</div><div class="value">${safeValue(
              selectedReport.totalInventory
            )}</div></div>
            <div class="card"><div class="label">Unit Numbers Inspected</div><div class="value">${safeValue(
              selectedReport.unitNumbersInspected
            )}</div></div>
            <div class="card"><div class="label">Total WCHRs Inspected</div><div class="value">${safeValue(
              selectedReport.totalWchrsInspected
            )}</div></div>
            <div class="card"><div class="label">Total WCHRs Available</div><div class="value">${safeValue(
              selectedReport.totalWchrsAvailable
            )}</div></div>
            <div class="card ${
              isAlertReport(selectedReport) ? "alert" : ""
            }"><div class="label">Any INOP WCHR</div><div class="value">${safeValue(
      selectedReport.anyInopWchr
    )}</div></div>
            <div class="card ${
              normalizeUnitList(selectedReport.outOfServiceUnits).length
                ? "alert"
                : ""
            }"><div class="label">Out Of Service Units</div><div class="value">${safeValue(
      selectedReport.outOfServiceUnits
    )}</div></div>
            <div class="card ${
              selectedReport.damageDetails ? "alert" : ""
            }"><div class="label">Damage Details</div><div class="value">${safeValue(
      selectedReport.damageDetails
    )}</div></div>
            <div class="card"><div class="label">Photo Notes</div><div class="value">${safeValue(
              selectedReport.photoNotes
            )}</div></div>
            <div class="card"><div class="label">Inspector Signature</div><div class="value">${safeValue(
              selectedReport.inspectorSignature
            )}</div></div>
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
        Only Duty Managers and Station Managers can view this page.
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
          TPA OPS · WCHR Admin
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
          WCHR POI Reports
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 900,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Review wheelchair inspections, track out of service units, assign duty
          manager follow-up, return units to service, and close cases.
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
            <FieldLabel>Date From</FieldLabel>
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>Date To</FieldLabel>
            <TextInput
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <SelectInput
              value={filters.location}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, location: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="Gate">Gate</option>
              <option value="Ticket Counter">Ticket Counter</option>
              <option value="Baggage Claim">Baggage Claim</option>
              <option value="Curbside">Curbside</option>
              <option value="Other">Other</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Report Type</FieldLabel>
            <SelectInput
              value={filters.alertsOnly}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, alertsOnly: e.target.value }))
              }
            >
              <option value="all">All Reports</option>
              <option value="alerts">Out of Service Reported</option>
              <option value="normal">Normal Reports</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Maintenance Status</FieldLabel>
            <SelectInput
              value={filters.maintenanceStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  maintenanceStatus: e.target.value,
                }))
              }
            >
              <option value="all">All Cases</option>
              <option value="open">Open Cases</option>
              <option value="closed">Closed Cases</option>
              <option value="back_on_service">Back On Service</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Search</FieldLabel>
            <TextInput
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Inspector, unit number, damage..."
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#9f1239",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Out of Service Reported
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#881337",
              }}
            >
              {unitCases.filter((item) => item.caseStatus !== "closed").length}
            </p>
          </div>

          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#065f46",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Back On Service
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#065f46",
              }}
            >
              {
                unitCases.filter(
                  (item) => String(item.backOnService).toLowerCase() === "yes"
                ).length
              }
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "16px 18px",
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
              Normal Reports
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {normalReports.length}
            </p>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <h2
          style={{
            marginTop: 0,
            marginBottom: 14,
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Out of Service Reported
        </h2>

        {loading ? (
          <div>Loading...</div>
        ) : unitCases.length === 0 ? (
          <div>No out of service cases found.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {unitCases.map((item, index) => {
              const closed =
                String(item.caseStatus || "").toLowerCase() === "closed";
              const backOnService =
                String(item.backOnService || "").toLowerCase() === "yes";

              return (
                <div
                  key={`${item.reportId}-${item.unitNumber}-${index}`}
                  style={{
                    border: `1px solid ${
                      closed ? "#bbf7d0" : "#fecdd3"
                    }`,
                    background: closed ? "#f0fdf4" : "#fff1f2",
                    borderRadius: 18,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 220 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: closed ? "#166534" : "#9f1239",
                      }}
                    >
                      {item.unitNumber}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: closed ? "#166534" : "#881337",
                        fontWeight: 700,
                      }}
                    >
                      {item.reportDate || "—"} · {item.location || "—"} ·{" "}
                      {item.inspectorName || "—"}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: "#334155",
                      }}
                    >
                      Taken by: <b>{item.takenBy || "Unassigned"}</b>
                      {" · "}
                      Status: <b>{item.caseStatus || "open"}</b>
                      {" · "}
                      Back on service: <b>{backOnService ? "Yes" : "No"}</b>
                    </div>
                  </div>

                  <ActionButton
                    variant={closed ? "success" : "warning"}
                    onClick={() => handleOpenUnitCase(item)}
                  >
                    {closed ? "View case" : "Open case"}
                  </ActionButton>
                </div>
              );
            })}
          </div>
        )}
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(340px, 0.95fr) minmax(540px, 1.25fr)"
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
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {item.date || "—"} · {item.location || "—"}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#64748b",
                      marginTop: 4,
                    }}
                  >
                    Inspector: {item.inspectorName || "—"}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: isAlertReport(item) ? "#9f1239" : "#1769aa",
                      marginTop: 4,
                      fontWeight: 700,
                    }}
                  >
                    {isAlertReport(item)
                      ? `Alert: ${normalizeUnitList(item.outOfServiceUnits).join(", ") || "Issue reported"}`
                      : `Units: ${item.unitNumbersInspected || "—"}`}
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
                      }}
                    >
                      WCHR POI Detail
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.date || "—"} · {selectedReport.time || "—"} ·{" "}
                      {selectedReport.location || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton variant="secondary" onClick={handleExportPdf}>
                      Export PDF
                    </ActionButton>

                    <ActionButton
                      variant="primary"
                      onClick={() => setIsEditMode(true)}
                    >
                      Edit
                    </ActionButton>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    ["Inspector Name", selectedReport.inspectorName],
                    ["Date", selectedReport.date],
                    ["Time", selectedReport.time],
                    ["Location", selectedReport.location],
                    ["Total Inventory", selectedReport.totalInventory],
                    ["Unit Numbers Inspected", selectedReport.unitNumbersInspected],
                    ["Total WCHRs Inspected", selectedReport.totalWchrsInspected],
                    ["Total WCHRs Available", selectedReport.totalWchrsAvailable],
                    ["Any INOP WCHR", selectedReport.anyInopWchr],
                    ["Out Of Service Units", selectedReport.outOfServiceUnits],
                    ["Damage Details", selectedReport.damageDetails],
                    ["Photo Notes", selectedReport.photoNotes],
                    ["Inspector Signature", selectedReport.inspectorSignature],
                    ["Created At", formatDateTime(selectedReport.createdAt)],
                    ["Updated At", formatDateTime(selectedReport.updatedAt)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        border: "1px solid #dbeafe",
                        borderRadius: 14,
                        padding: "10px 12px",
                        background:
                          label === "Out Of Service Units" && normalizeUnitList(value).length
                            ? "#fff1f2"
                            : "#f8fbff",
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
                        {label}
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
                  ))}
                </div>

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
                      Edit WCHR POI
                    </h2>
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
                      {savingEditId === selectedReport.id ? "Saving..." : "Save Edits"}
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
                    <FieldLabel>Inspector Name</FieldLabel>
                    <TextInput
                      value={editData.inspectorName}
                      onChange={(e) =>
                        handleEditField("inspectorName", e.target.value)
                      }
                    />
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
                    <FieldLabel>Time</FieldLabel>
                    <TextInput
                      type="time"
                      value={editData.time}
                      onChange={(e) => handleEditField("time", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Location</FieldLabel>
                    <SelectInput
                      value={editData.location}
                      onChange={(e) => handleEditField("location", e.target.value)}
                    >
                      <option value="">Select location</option>
                      <option value="Gate">Gate</option>
                      <option value="Ticket Counter">Ticket Counter</option>
                      <option value="Baggage Claim">Baggage Claim</option>
                      <option value="Curbside">Curbside</option>
                      <option value="Other">Other</option>
                    </SelectInput>
                  </div>
                </div>

                <div>
                  <FieldLabel>Unit Numbers Inspected</FieldLabel>
                  <TextArea
                    value={editData.unitNumbersInspected}
                    onChange={(e) =>
                      handleEditField("unitNumbersInspected", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Out Of Service Units</FieldLabel>
                  <TextArea
                    value={editData.outOfServiceUnits}
                    onChange={(e) =>
                      handleEditField("outOfServiceUnits", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Damage Details</FieldLabel>
                  <TextArea
                    value={editData.damageDetails}
                    onChange={(e) =>
                      handleEditField("damageDetails", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Photo Notes</FieldLabel>
                  <TextArea
                    value={editData.photoNotes}
                    onChange={(e) =>
                      handleEditField("photoNotes", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Inspector Signature</FieldLabel>
                  <TextInput
                    value={editData.inspectorSignature}
                    onChange={(e) =>
                      handleEditField("inspectorSignature", e.target.value)
                    }
                  />
                </div>

                <div>
                  <h3
                    style={{
                      margin: "8px 0 10px",
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    Inspection Results
                  </h3>

                  <div style={{ display: "grid", gap: 10 }}>
                    {editData.inspectionResults.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          border: "1px solid #dbeafe",
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#0f172a",
                            lineHeight: 1.5,
                          }}
                        >
                          {item?.itemNumber || index + 1}. {item?.label}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 18,
                            flexWrap: "wrap",
                          }}
                        >
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 700,
                              color: "#065f46",
                            }}
                          >
                            <input
                              type="radio"
                              name={`edit_item_${index}`}
                              checked={String(item?.result || "").toLowerCase() === "yes"}
                              onChange={() => handleInspectionResultChange(index, "yes")}
                            />
                            Yes
                          </label>

                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 700,
                              color: "#9f1239",
                            }}
                          >
                            <input
                              type="radio"
                              name={`edit_item_${index}`}
                              checked={String(item?.result || "").toLowerCase() === "no"}
                              onChange={() => handleInspectionResultChange(index, "no")}
                            />
                            No
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </PageCard>
        )}
      </div>

      {selectedUnitCase && (
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
          onClick={() => setSelectedUnitCase(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background:
                  String(selectedUnitCase.caseStatus || "").toLowerCase() === "closed"
                    ? "#ecfdf5"
                    : "#fff1f2",
                borderBottom:
                  String(selectedUnitCase.caseStatus || "").toLowerCase() === "closed"
                    ? "1px solid #a7f3d0"
                    : "1px solid #fecdd3",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color:
                    String(selectedUnitCase.caseStatus || "").toLowerCase() === "closed"
                      ? "#065f46"
                      : "#9f1239",
                }}
              >
                Out of Service Reported · {selectedUnitCase.unitNumber}
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#475569",
                }}
              >
                {selectedUnitCase.reportDate || "—"} · {selectedUnitCase.reportTime || "—"} ·{" "}
                {selectedUnitCase.location || "—"}
              </div>
            </div>

            <div style={{ padding: 20, display: "grid", gap: 16 }}>
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 16,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#9a3412",
                    textTransform: "uppercase",
                  }}
                >
                  Damage reported
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#7c2d12",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {safeValue(selectedUnitCase.damageDetails)}
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
                  <FieldLabel>Duty Manager Taking Case</FieldLabel>
                  <TextInput
                    value={selectedUnitCase.takenBy}
                    onChange={(e) => handleUnitCaseField("takenBy", e.target.value)}
                    placeholder="Who is taking this case?"
                  />
                </div>

                <div>
                  <FieldLabel>Case Status</FieldLabel>
                  <SelectInput
                    value={selectedUnitCase.caseStatus}
                    onChange={(e) =>
                      handleUnitCaseField("caseStatus", e.target.value)
                    }
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="closed">Closed</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Back On Service</FieldLabel>
                  <SelectInput
                    value={selectedUnitCase.backOnService}
                    onChange={(e) =>
                      handleUnitCaseField("backOnService", e.target.value)
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Return Date</FieldLabel>
                  <TextInput
                    type="date"
                    value={selectedUnitCase.returnDate}
                    onChange={(e) =>
                      handleUnitCaseField("returnDate", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Maintenance Cost</FieldLabel>
                  <TextInput
                    type="number"
                    step="0.01"
                    value={selectedUnitCase.maintenanceCost}
                    onChange={(e) =>
                      handleUnitCaseField("maintenanceCost", e.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>What Was Done</FieldLabel>
                <TextArea
                  value={selectedUnitCase.workPerformed}
                  onChange={(e) =>
                    handleUnitCaseField("workPerformed", e.target.value)
                  }
                  placeholder="Explain what was repaired or serviced"
                />
              </div>

              <div>
                <FieldLabel>What Was Changed</FieldLabel>
                <TextArea
                  value={selectedUnitCase.partsChanged}
                  onChange={(e) =>
                    handleUnitCaseField("partsChanged", e.target.value)
                  }
                  placeholder="Parts replaced, adjusted, or removed"
                />
              </div>

              <div>
                <FieldLabel>Case Notes</FieldLabel>
                <TextArea
                  value={selectedUnitCase.notes}
                  onChange={(e) =>
                    handleUnitCaseField("notes", e.target.value)
                  }
                  placeholder="Additional follow-up notes"
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
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
                    }}
                  >
                    Reported By
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {safeValue(selectedUnitCase.inspectorName)}
                  </div>
                </div>

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
                    }}
                  >
                    Closed By
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {safeValue(selectedUnitCase.closedBy)}
                  </div>
                </div>

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
                    }}
                  >
                    Closed At
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {safeValue(selectedUnitCase.closedAt)}
                  </div>
                </div>

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
                    }}
                  >
                    Maintenance Cost
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {formatMoney(selectedUnitCase.maintenanceCost)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <ActionButton
                  variant="secondary"
                  onClick={() => setSelectedUnitCase(null)}
                >
                  Cancel
                </ActionButton>

                <ActionButton
                  variant="success"
                  onClick={handleSaveUnitCase}
                  disabled={savingUnitCase}
                >
                  {savingUnitCase ? "Saving..." : "Save Case"}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
