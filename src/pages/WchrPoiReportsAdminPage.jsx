import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

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
        background: props.disabled ? "#f8fafc" : "#fff",
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
        background: props.disabled ? "#f8fafc" : "#fff",
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

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#fff",
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
  disabled = false,
  type = "button",
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#fff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
    },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
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

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") return "\u2014";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "\u2014";
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
  if (!value) return "\u2014";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "\u2014";
  }
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "\u2014";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function getMonthKey(dateValue) {
  const value = String(dateValue || "");
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "unknown";
}

function formatMonthLabel(monthKey) {
  if (monthKey === "unknown") return "Unknown Date";
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function isAlertReport(report) {
  const anyInop = String(report?.anyInopWchr || "").toLowerCase() === "yes";
  const hasOutOfService =
    normalizeUnitList(report?.outOfServiceUnits).length > 0;
  const inspectionResults = Array.isArray(report?.inspectionResults)
    ? report.inspectionResults
    : [];
  const hasFailedChecks = inspectionResults.some(
    (item) => String(item?.result || "").toLowerCase() === "no"
  );

  return anyInop || hasOutOfService || hasFailedChecks;
}

function getMaintenanceState(report, unitNumber) {
  const state = report?.maintenanceCase?.[unitNumber];
  return state && typeof state === "object" ? state : {};
}

function buildGroupedUnitCases(reports) {
  const grouped = new Map();

  for (const report of reports) {
    const units = normalizeUnitList(report?.outOfServiceUnits);

    for (const unitNumber of units) {
      const occurrence = {
        reportId: report.id,
        reportDate: report.date || "",
        reportTime: report.time || "",
        location: report.location || "",
        inspectorName: report.inspectorName || "",
        damageDetails: report.damageDetails || "",
        photoNotes: report.photoNotes || "",
        createdAt: report.createdAt || null,
      };

      const maintenance = getMaintenanceState(report, unitNumber);

      if (!grouped.has(unitNumber)) {
        grouped.set(unitNumber, {
          unitNumber,
          occurrences: [],
          reportIds: [],
          latestReportId: report.id,
          latestReportDate: report.date || "",
          latestReportTime: report.time || "",
          latestLocation: report.location || "",
          latestInspectorName: report.inspectorName || "",
          latestDamageDetails: report.damageDetails || "",
          latestPhotoNotes: report.photoNotes || "",
          takenBy: maintenance.takenBy || "",
          caseStatus: maintenance.caseStatus || "open",
          backOnService: maintenance.backOnService || "no",
          returnDate: maintenance.returnDate || "",
          workPerformed: maintenance.workPerformed || "",
          partsChanged: maintenance.partsChanged || "",
          maintenanceCost: maintenance.maintenanceCost || "",
          notes: maintenance.notes || "",
          closedBy: maintenance.closedBy || "",
          closedAt: maintenance.closedAt || "",
        });
      }

      const item = grouped.get(unitNumber);
      item.occurrences.push(occurrence);
      item.reportIds.push(report.id);

      const currentDate = `${item.latestReportDate} ${item.latestReportTime}`;
      const candidateDate = `${report.date || ""} ${report.time || ""}`;

      if (candidateDate > currentDate) {
        item.latestReportId = report.id;
        item.latestReportDate = report.date || "";
        item.latestReportTime = report.time || "";
        item.latestLocation = report.location || "";
        item.latestInspectorName = report.inspectorName || "";
        item.latestDamageDetails = report.damageDetails || "";
        item.latestPhotoNotes = report.photoNotes || "";
      }

      const maintenanceHasData =
        maintenance.takenBy ||
        maintenance.caseStatus === "closed" ||
        maintenance.backOnService === "yes" ||
        maintenance.returnDate ||
        maintenance.workPerformed ||
        maintenance.maintenanceCost;

      if (maintenanceHasData) {
        item.takenBy = maintenance.takenBy || item.takenBy;
        item.caseStatus = maintenance.caseStatus || item.caseStatus;
        item.backOnService = maintenance.backOnService || item.backOnService;
        item.returnDate = maintenance.returnDate || item.returnDate;
        item.workPerformed = maintenance.workPerformed || item.workPerformed;
        item.partsChanged = maintenance.partsChanged || item.partsChanged;
        item.maintenanceCost =
          maintenance.maintenanceCost || item.maintenanceCost;
        item.notes = maintenance.notes || item.notes;
        item.closedBy = maintenance.closedBy || item.closedBy;
        item.closedAt = maintenance.closedAt || item.closedAt;
      }
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      occurrenceCount: item.occurrences.length,
      reportIds: Array.from(new Set(item.reportIds)),
      occurrences: [...item.occurrences].sort((a, b) =>
        `${b.reportDate} ${b.reportTime}`.localeCompare(
          `${a.reportDate} ${a.reportTime}`
        )
      ),
    }))
    .sort((a, b) =>
      `${b.latestReportDate} ${b.latestReportTime}`.localeCompare(
        `${a.latestReportDate} ${a.latestReportTime}`
      )
    );
}

export default function WchrPoiReportsAdminPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

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

  const [expandedMonths, setExpandedMonths] = useState({});
  const [deletingMonth, setDeletingMonth] = useState("");

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

  const activeReports = useMemo(
    () => reports.filter((item) => !item.archived),
    [reports]
  );

  const visibleReports = useMemo(() => {
    return activeReports.filter((item) => {
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
  }, [activeReports, filters]);

  const groupedUnitCases = useMemo(
    () => buildGroupedUnitCases(activeReports.filter(isAlertReport)),
    [activeReports]
  );

  const filteredUnitCases = useMemo(() => {
    return groupedUnitCases.filter((item) => {
      const caseStatus = String(item.caseStatus || "").toLowerCase();
      const backOnService = String(item.backOnService || "").toLowerCase();

      if (filters.maintenanceStatus === "all") return true;
      if (filters.maintenanceStatus === "open") {
        return !(caseStatus === "closed" && backOnService === "yes");
      }
      if (filters.maintenanceStatus === "closed") {
        return caseStatus === "closed";
      }
      if (filters.maintenanceStatus === "back_on_service") {
        return backOnService === "yes";
      }
      return true;
    });
  }, [groupedUnitCases, filters.maintenanceStatus]);

  const openUnitCases = useMemo(
    () =>
      filteredUnitCases.filter((item) => {
        const caseStatus = String(item.caseStatus || "").toLowerCase();
        const backOnService = String(item.backOnService || "").toLowerCase();
        return !(caseStatus === "closed" && backOnService === "yes");
      }),
    [filteredUnitCases]
  );

  const resolvedUnitCases = useMemo(
    () =>
      filteredUnitCases.filter((item) => {
        const caseStatus = String(item.caseStatus || "").toLowerCase();
        const backOnService = String(item.backOnService || "").toLowerCase();
        return caseStatus === "closed" && backOnService === "yes";
      }),
    [filteredUnitCases]
  );

  const normalReports = useMemo(
    () => visibleReports.filter((item) => !isAlertReport(item)),
    [visibleReports]
  );

  const monthlyGroups = useMemo(() => {
    const map = new Map();

    for (const report of visibleReports) {
      const key = getMonthKey(report.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(report);
    }

    return Array.from(map.entries())
      .map(([monthKey, items]) => ({
        monthKey,
        label: formatMonthLabel(monthKey),
        reports: [...items].sort((a, b) =>
          `${b.date || ""} ${b.time || ""}`.localeCompare(
            `${a.date || ""} ${a.time || ""}`
          )
        ),
        alertCount: items.filter(isAlertReport).length,
        normalCount: items.filter((x) => !isAlertReport(x)).length,
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [visibleReports]);

  const selectedReport = useMemo(
    () => visibleReports.find((item) => item.id === selectedId) || null,
    [visibleReports, selectedId]
  );

  useEffect(() => {
    if (selectedId && !visibleReports.some((item) => item.id === selectedId)) {
      setSelectedId("");
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
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleInspectionResultChange = (index, value) => {
    setEditData((prev) => {
      const next = [...prev.inspectionResults];
      next[index] = { ...next[index], result: value };
      return { ...prev, inspectionResults: next };
    });
  };

  const handleArchive = async () => {
    if (!selectedReport) return;

    try {
      setArchivingId(selectedReport.id);

      await updateDoc(doc(db, "wchr_poi_reports", selectedReport.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedByName: getVisibleName(user),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id ? { ...item, archived: true } : item
        )
      );

      setSelectedId("");
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

      setReports((prev) =>
        prev.filter((item) => item.id !== selectedReport.id)
      );
      setSelectedId("");
      setStatusMessage("WCHR POI deleted.");
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not delete WCHR POI.");
    } finally {
      setDeletingId("");
    }
  };

  const handleDeleteMonth = async (group) => {
    const ok = window.confirm(
      `Delete all ${group.reports.length} WCHR POI reports from ${group.label}? This cannot be undone.`
    );
    if (!ok) return;

    try {
      setDeletingMonth(group.monthKey);

      for (const report of group.reports) {
        await deleteDoc(doc(db, "wchr_poi_reports", report.id));
      }

      const ids = new Set(group.reports.map((x) => x.id));
      setReports((prev) => prev.filter((item) => !ids.has(item.id)));
      setSelectedId("");
      setStatusMessage(`${group.label} POI reports deleted.`);
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not delete the monthly POI file.");
    } finally {
      setDeletingMonth("");
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
        updatedByName: getVisibleName(user),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? { ...item, ...editData, unitNumbersList }
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
    setSelectedUnitCase((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveUnitCase = async () => {
    if (!selectedUnitCase) return;

    if (!String(selectedUnitCase.takenBy || "").trim()) {
      setStatusMessage("Please enter who is taking the case.");
      return;
    }

    const isClosing =
      String(selectedUnitCase.caseStatus || "").toLowerCase() === "closed" &&
      String(selectedUnitCase.backOnService || "").toLowerCase() === "yes";

    if (isClosing) {
      if (!String(selectedUnitCase.returnDate || "").trim()) {
        setStatusMessage("Please enter return date before closing the case.");
        return;
      }

      if (!String(selectedUnitCase.workPerformed || "").trim()) {
        setStatusMessage("Please enter what was done before closing the case.");
        return;
      }

      const cost = Number(selectedUnitCase.maintenanceCost);
      if (
        String(selectedUnitCase.maintenanceCost || "").trim() === "" ||
        !Number.isFinite(cost) ||
        cost < 0
      ) {
        setStatusMessage(
          "Please enter a valid maintenance cost before closing the case."
        );
        return;
      }
    }

    try {
      setSavingUnitCase(true);

      const nextState = {
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
            ? getVisibleName(user)
            : "",
        closedAt:
          selectedUnitCase.caseStatus === "closed"
            ? new Date().toISOString()
            : "",
        updatedAt: new Date().toISOString(),
        updatedBy: getVisibleName(user),
      };

      const affectedIds = selectedUnitCase.reportIds || [];

      for (const reportId of affectedIds) {
        const report = reports.find((r) => r.id === reportId);
        const currentMaintenanceCase = report?.maintenanceCase || {};

        await updateDoc(doc(db, "wchr_poi_reports", reportId), {
          maintenanceCase: {
            ...currentMaintenanceCase,
            [selectedUnitCase.unitNumber]: nextState,
          },
          updatedAt: serverTimestamp(),
        });
      }

      setReports((prev) =>
        prev.map((item) => {
          if (!affectedIds.includes(item.id)) return item;

          return {
            ...item,
            maintenanceCase: {
              ...(item.maintenanceCase || {}),
              [selectedUnitCase.unitNumber]: nextState,
            },
          };
        })
      );

      setStatusMessage(
        `Case for ${selectedUnitCase.unitNumber} updated across ${affectedIds.length} report(s).`
      );
      setSelectedUnitCase(null);
    } catch (err) {
      console.error(err);
      setStatusMessage("Could not save WCHR case.");
    } finally {
      setSavingUnitCase(false);
    }
  };

  const printHtml = (title, subtitle, body) => {
    const printableWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printableWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    printableWindow.document.open();
    printableWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 26px; }
            .brand { font-size: 12px; font-weight: 800; color: #1769aa; text-transform: uppercase; letter-spacing: .08em; }
            .subtitle { color: #475569; font-size: 13px; margin: 6px 0 20px; }
            .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px; }
            .card { border:1px solid #dbeafe; border-radius:12px; padding:10px 12px; background:#f8fbff; break-inside:avoid; }
            .alert { background:#fff1f2; border-color:#fecdd3; }
            .label { font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; }
            .value { margin-top:4px; font-size:13px; font-weight:700; white-space:pre-wrap; word-break:break-word; }
            .report { margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid #e2e8f0; break-inside:avoid; }
            .report-title { font-size:15px; font-weight:800; margin-bottom:8px; }
            @media print { button { display:none !important; } }
          </style>
        </head>
        <body>
          <div class="brand">${APP_NAME}</div>
          <h1>${title}</h1>
          <div class="subtitle">${subtitle}</div>
          ${body}
          <script>window.onload=function(){window.print();};</script>
        </body>
      </html>
    `);
    printableWindow.document.close();
  };

  const handlePrintReport = (report) => {
    if (!report) return;

    const rows = [
      ["Inspector Name", report.inspectorName],
      ["Date", report.date],
      ["Time", report.time],
      ["Location", report.location],
      ["Total Inventory", report.totalInventory],
      ["Unit Numbers Inspected", report.unitNumbersInspected],
      ["Total WCHRs Inspected", report.totalWchrsInspected],
      ["Total WCHRs Available", report.totalWchrsAvailable],
      ["Any INOP WCHR", report.anyInopWchr],
      ["Out Of Service Units", report.outOfServiceUnits],
      ["Damage Details", report.damageDetails],
      ["Photo Notes", report.photoNotes],
      ["Inspector Signature", report.inspectorSignature],
    ]
      .map(
        ([label, value]) => `
          <div class="card ${
            label === "Out Of Service Units" &&
            normalizeUnitList(value).length
              ? "alert"
              : ""
          }">
            <div class="label">${label}</div>
            <div class="value">${safeValue(value)}</div>
          </div>
        `
      )
      .join("");

    printHtml(
      "Wheelchair Pre-Operating Inspection (POI)",
      `${report.date || "\u2014"} \u00B7 ${report.time || "\u2014"} \u00B7 ${
        report.location || "\u2014"
      }`,
      `<div class="summary">${rows}</div>`
    );
  };

  const handlePrintMonth = (group) => {
    const body = group.reports
      .map(
        (report) => `
          <div class="report">
            <div class="report-title">
              ${report.date || "\u2014"} \u00B7 ${report.time || "\u2014"} \u00B7 ${
          report.location || "\u2014"
        }
              ${isAlertReport(report) ? " \u2014 ALERT" : ""}
            </div>
            <div class="summary">
              <div class="card"><div class="label">Inspector</div><div class="value">${safeValue(
                report.inspectorName
              )}</div></div>
              <div class="card"><div class="label">Units Inspected</div><div class="value">${safeValue(
                report.unitNumbersInspected
              )}</div></div>
              <div class="card ${
                isAlertReport(report) ? "alert" : ""
              }"><div class="label">Out Of Service</div><div class="value">${safeValue(
          report.outOfServiceUnits
        )}</div></div>
            </div>
          </div>
        `
      )
      .join("");

    printHtml(
      `WCHR POI Monthly Report \u2014 ${group.label}`,
      `${group.reports.length} report(s) \u00B7 ${group.alertCount} issue report(s) \u00B7 ${group.normalCount} normal report(s)`,
      body
    );
  };

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 18 }}>
        Only Duty Managers and Station Managers can view this page.
      </PageCard>
    );
  }

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0,1fr))"
      : "repeat(auto-fit, minmax(220px,1fr))",
    gap: isMobile ? 10 : 14,
  };

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        minWidth: 0,
        overflowX: "hidden",
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
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width: isMobile ? 34 : 40,
              height: isMobile ? 34 : 40,
              borderRadius: 10,
              background: "#fff",
              objectFit: "contain",
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
            {APP_NAME} {"\u00B7"} WCHR Management
          </p>
        </div>

        <h1
          style={{
            margin: "6px 0 4px",
            fontSize: isMobile ? 20 : 25,
            lineHeight: 1.08,
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          WCHR POI Reports
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 900,
            fontSize: isMobile ? 11.5 : 12.5,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Monthly POI files, wheelchair maintenance tracking, printing and
          management follow-up.
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

      {statusMessage && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#1769aa",
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
                setFilters((prev) => ({
                  ...prev,
                  alertsOnly: e.target.value,
                }))
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
                setFilters((prev) => ({
                  ...prev,
                  search: e.target.value,
                }))
              }
              placeholder="Inspector, unit, damage..."
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={gridStyle}>
          {[
            ["Open Unique WCHR Cases", openUnitCases.length, "#fff1f2", "#9f1239"],
            ["Back On Service", resolvedUnitCases.length, "#ecfdf5", "#065f46"],
            ["Normal POI Reports", normalReports.length, "#f8fbff", "#0f172a"],
          ].map(([label, value, bg, color]) => (
            <div
              key={label}
              style={{
                background: bg,
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 26,
                  fontWeight: 900,
                  color,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
          }}
        >
          Open WCHR Maintenance Cases
        </h2>

        {loading ? (
          <div>Loading...</div>
        ) : openUnitCases.length === 0 ? (
          <div>No open WCHR cases.</div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {openUnitCases.map((item) => (
              <div
                key={item.unitNumber}
                style={{
                  border: "1px solid #fecdd3",
                  background: "#fff1f2",
                  borderRadius: 14,
                  padding: isMobile ? 12 : 14,
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: isMobile ? "stretch" : "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 900,
                      color: "#9f1239",
                    }}
                  >
                    {item.unitNumber}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 12.5,
                      color: "#881337",
                      fontWeight: 700,
                    }}
                  >
                    Latest: {item.latestReportDate || "\u2014"} {"\u00B7"}{" "}
                    {item.latestLocation || "\u2014"}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "#475569",
                    }}
                  >
                    Reported {item.occurrenceCount} time(s). One active case is
                    maintained for this wheelchair.
                  </div>
                </div>

                <ActionButton
                  variant="warning"
                  onClick={() => handleOpenUnitCase(item)}
                >
                  Open case
                </ActionButton>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
          }}
        >
          Monthly POI Files
        </h2>

        {monthlyGroups.length === 0 ? (
          <div>No reports found.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {monthlyGroups.map((group) => {
              const expanded = Boolean(expandedMonths[group.monthKey]);

              return (
                <div
                  key={group.monthKey}
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 15,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      padding: isMobile ? 12 : 14,
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: isMobile ? "stretch" : "center",
                      background: "#f8fbff",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          color: "#0f172a",
                        }}
                      >
                        {group.label}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 12,
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        {group.reports.length} report(s) {"\u00B7"}{" "}
                        {group.alertCount} issue report(s)
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <ActionButton
                        variant="secondary"
                        onClick={() =>
                          setExpandedMonths((prev) => ({
                            ...prev,
                            [group.monthKey]: !expanded,
                          }))
                        }
                      >
                        {expanded ? "Hide" : "Open Month"}
                      </ActionButton>

                      <ActionButton
                        variant="primary"
                        onClick={() => handlePrintMonth(group)}
                      >
                        Print Month
                      </ActionButton>

                      <ActionButton
                        variant="danger"
                        disabled={deletingMonth === group.monthKey}
                        onClick={() => handleDeleteMonth(group)}
                      >
                        {deletingMonth === group.monthKey
                          ? "Deleting..."
                          : "Delete Month"}
                      </ActionButton>
                    </div>
                  </div>

                  {expanded && (
                    <div
                      style={{
                        padding: isMobile ? 10 : 12,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {group.reports.map((item) => (
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
                                ? "1px solid #60a5fa"
                                : "1px solid #e2e8f0",
                            background:
                              item.id === selectedId ? "#edf7ff" : "#fff",
                            borderRadius: 12,
                            padding: 11,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: 13,
                              color: "#0f172a",
                            }}
                          >
                            {item.date || "\u2014"} {"\u00B7"}{" "}
                            {item.location || "\u2014"}
                          </div>
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              color: isAlertReport(item)
                                ? "#9f1239"
                                : "#64748b",
                              fontWeight: 700,
                            }}
                          >
                            {isAlertReport(item)
                              ? `Issue: ${
                                  normalizeUnitList(
                                    item.outOfServiceUnits
                                  ).join(", ") || "Failed inspection"
                                }`
                              : `Inspector: ${
                                  item.inspectorName || "\u2014"
                                }`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageCard>

      {selectedReport && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          {!isEditMode ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: isMobile ? 18 : 21,
                      fontWeight: 900,
                    }}
                  >
                    WCHR POI Detail
                  </h2>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {selectedReport.date || "\u2014"} {"\u00B7"}{" "}
                    {selectedReport.time || "\u2014"} {"\u00B7"}{" "}
                    {selectedReport.location || "\u2014"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={() => handlePrintReport(selectedReport)}
                  >
                    Print Report
                  </ActionButton>
                  <ActionButton
                    variant="primary"
                    onClick={() => setIsEditMode(true)}
                  >
                    Edit
                  </ActionButton>
                </div>
              </div>

              <div style={gridStyle}>
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
                      borderRadius: 12,
                      padding: "10px 12px",
                      background:
                        label === "Out Of Service Units" &&
                        normalizeUnitList(value).length
                          ? "#fff1f2"
                          : "#f8fbff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
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
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
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
                  gap: 8,
                  flexWrap: "wrap",
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
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 18 : 21,
                    fontWeight: 900,
                  }}
                >
                  Edit WCHR POI
                </h2>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

              <div style={gridStyle}>
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
                    onChange={(e) =>
                      handleEditField("date", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Time</FieldLabel>
                  <TextInput
                    type="time"
                    value={editData.time}
                    onChange={(e) =>
                      handleEditField("time", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Location</FieldLabel>
                  <SelectInput
                    value={editData.location}
                    onChange={(e) =>
                      handleEditField("location", e.target.value)
                    }
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
                    handleEditField(
                      "unitNumbersInspected",
                      e.target.value
                    )
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
                    handleEditField(
                      "inspectorSignature",
                      e.target.value
                    )
                  }
                />
              </div>

              <div style={{ display: "grid", gap: 9 }}>
                <h3
                  style={{
                    margin: "4px 0",
                    fontSize: 15,
                    fontWeight: 900,
                  }}
                >
                  Inspection Results
                </h3>

                {editData.inspectionResults.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      border:
                        String(item?.result || "").toLowerCase() === "no"
                          ? "1px solid #fda4af"
                          : "1px solid #dbeafe",
                      background:
                        String(item?.result || "").toLowerCase() === "no"
                          ? "#fff1f2"
                          : "#f8fbff",
                      borderRadius: 12,
                      padding: 11,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        lineHeight: 1.45,
                      }}
                    >
                      {item?.itemNumber || index + 1}. {item?.label}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        gap: 18,
                      }}
                    >
                      <label style={{ fontWeight: 800, color: "#065f46" }}>
                        <input
                          type="radio"
                          name={`edit_item_${index}`}
                          checked={
                            String(item?.result || "").toLowerCase() === "yes"
                          }
                          onChange={() =>
                            handleInspectionResultChange(index, "yes")
                          }
                        />{" "}
                        Yes
                      </label>

                      <label style={{ fontWeight: 800, color: "#9f1239" }}>
                        <input
                          type="radio"
                          name={`edit_item_${index}`}
                          checked={
                            String(item?.result || "").toLowerCase() === "no"
                          }
                          onChange={() =>
                            handleInspectionResultChange(index, "no")
                          }
                        />{" "}
                        No
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PageCard>
      )}

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
            padding: 16,
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
              background: "#fff",
              borderRadius: 20,
              border: "1px solid #e2e8f0",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                background:
                  String(selectedUnitCase.caseStatus || "").toLowerCase() ===
                  "closed"
                    ? "#ecfdf5"
                    : "#fff1f2",
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 18 : 21,
                  fontWeight: 900,
                  color:
                    String(selectedUnitCase.caseStatus || "").toLowerCase() ===
                    "closed"
                      ? "#065f46"
                      : "#9f1239",
                }}
              >
                WCHR Case {"\u00B7"} {selectedUnitCase.unitNumber}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  color: "#475569",
                  fontWeight: 700,
                }}
              >
                Reported {selectedUnitCase.occurrenceCount} time(s). Latest:{" "}
                {selectedUnitCase.latestReportDate || "\u2014"}
              </div>
            </div>

            <div
              style={{
                padding: isMobile ? 14 : 18,
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  border: "1px solid #fed7aa",
                  background: "#fff7ed",
                  borderRadius: 13,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    color: "#9a3412",
                    textTransform: "uppercase",
                  }}
                >
                  Latest damage reported
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {safeValue(selectedUnitCase.latestDamageDetails)}
                </div>
              </div>

              <div style={gridStyle}>
                <div>
                  <FieldLabel>Duty Manager Taking Case</FieldLabel>
                  <TextInput
                    value={selectedUnitCase.takenBy}
                    onChange={(e) =>
                      handleUnitCaseField("takenBy", e.target.value)
                    }
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
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={selectedUnitCase.maintenanceCost}
                    onChange={(e) =>
                      handleUnitCaseField(
                        "maintenanceCost",
                        e.target.value
                      )
                    }
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
                />
              </div>

              <div>
                <FieldLabel>Parts / Changes</FieldLabel>
                <TextArea
                  value={selectedUnitCase.partsChanged}
                  onChange={(e) =>
                    handleUnitCaseField("partsChanged", e.target.value)
                  }
                />
              </div>

              <div>
                <FieldLabel>Case Notes</FieldLabel>
                <TextArea
                  value={selectedUnitCase.notes}
                  onChange={(e) =>
                    handleUnitCaseField("notes", e.target.value)
                  }
                />
              </div>

              <div>
                <FieldLabel>POI History for This WCHR</FieldLabel>
                <div style={{ display: "grid", gap: 7 }}>
                  {selectedUnitCase.occurrences.map((occurrence) => (
                    <div
                      key={occurrence.reportId}
                      style={{
                        border: "1px solid #dbeafe",
                        borderRadius: 11,
                        padding: 10,
                        background: "#f8fbff",
                        fontSize: 12,
                      }}
                    >
                      <strong>{occurrence.reportDate || "\u2014"}</strong>{" "}
                      {"\u00B7"} {occurrence.location || "\u2014"} {"\u00B7"}{" "}
                      {occurrence.inspectorName || "\u2014"}
                      <div
                        style={{
                          marginTop: 4,
                          color: "#475569",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {safeValue(occurrence.damageDetails)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
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
