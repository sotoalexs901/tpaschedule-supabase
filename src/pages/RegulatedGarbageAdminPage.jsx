import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
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

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
      type="button"
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

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        border: active ? "1px solid #1769aa" : "1px solid #dbeafe",
        background: active ? "#1769aa" : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        boxShadow: active ? "0 10px 22px rgba(23,105,170,0.16)" : "none",
      }}
    >
      {children}
    </button>
  );
}

const DEFAULT_INVENTORY_ITEMS = [
  {
    productKey: "disinfectant",
    productLabel: "Disinfectant",
    unit: "units",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "detergent",
    productLabel: "Detergent",
    unit: "units",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "clean_water",
    productLabel: "Clean Water",
    unit: "units",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "whisk_broom_dustpan",
    productLabel: "Whisk Broom / Dustpan",
    unit: "units",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "scrub_brush",
    productLabel: "Scrub Brush",
    unit: "units",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "zip_ties",
    productLabel: "Zip Ties",
    unit: "units",
    minimumQty: 5,
    location: "Office / Storage",
  },
  {
    productKey: "paper_towels",
    productLabel: "Paper Towels",
    unit: "units",
    minimumQty: 3,
    location: "Office / Storage",
  },
  {
    productKey: "orange_bags",
    productLabel: "Orange Bags",
    unit: "bags",
    minimumQty: 20,
    location: "Office / Storage",
  },
  {
    productKey: "ppe_goggles_gloves",
    productLabel: "PPE (Goggles / Gloves)",
    unit: "sets",
    minimumQty: 2,
    location: "Office / Storage",
  },
  {
    productKey: "spill_kit_contents_copy",
    productLabel: "Copy of Spill Kit Contents",
    unit: "copies",
    minimumQty: 1,
    location: "Office / Storage",
  },
  {
    productKey: "plastic_bags",
    productLabel: "Plastic Bags",
    unit: "bags",
    minimumQty: 10,
    location: "Office / Storage",
  },
];

function getStatusPill(status) {
  const value = String(status || "open").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (value === "closed" || value === "approved") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    };
  }

  if (value === "archived") {
    return {
      ...base,
      background: "#f8fafc",
      color: "#334155",
      borderColor: "#e2e8f0",
    };
  }

  if (value === "processing" || value === "assigned" || value === "follow_up") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (value === "restock_in_place") {
    return {
      ...base,
      background: "#ecfeff",
      color: "#0f766e",
      borderColor: "#99f6e4",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

export default function RegulatedGarbageAdminPage() {
  const { user } = useUser();

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [activeTab, setActiveTab] = useState("reports");

  const [inventoryRows, setInventoryRows] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [alertRows, setAlertRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [selectedAlertId, setSelectedAlertId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");

  const [savingAlertId, setSavingAlertId] = useState("");
  const [savingInventoryId, setSavingInventoryId] = useState("");
  const [savingReportId, setSavingReportId] = useState("");
  const [creatingInventory, setCreatingInventory] = useState(false);

  const [inventoryDrafts, setInventoryDrafts] = useState({});
  const [reportEdit, setReportEdit] = useState({
    reviewStatus: "submitted",
    managerNotes: "",
    followUpAction: "",
    followUpDetails: "",
  });
  const [alertEdit, setAlertEdit] = useState({
    assignedManagerName: "",
    managerNotes: "",
    followUpStatus: "submitted",
    estimatedRestockDate: "",
    actualReplacementDate: "",
    restockInProgressMessage: "",
  });

  useEffect(() => {
    async function loadAll() {
      try {
        const [inventorySnap, reportsSnap, alertsSnap] = await Promise.all([
          getDocs(collection(db, "regulated_garbage_inventory")),
          getDocs(
            query(collection(db, "regulated_garbage_reports"), orderBy("createdAt", "desc"))
          ),
          getDocs(
            query(
              collection(db, "regulated_garbage_supply_alerts"),
              orderBy("createdAt", "desc")
            )
          ),
        ]);

        const inventory = inventorySnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          stockQty: safeNumber(d.data().stockQty),
          minimumQty: safeNumber(d.data().minimumQty),
        }));

        const reports = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const alerts = alertsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setInventoryRows(inventory);
        setReportRows(reports);
        setAlertRows(alerts);
      } catch (err) {
        console.error("Error loading regulated garbage admin:", err);
        setStatusMessage("Could not load regulated garbage admin data.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const visibleReports = useMemo(() => {
    return reportRows.filter(
      (item) => String(item.archived || "").toLowerCase() !== "true"
    );
  }, [reportRows]);

  const visibleAlerts = useMemo(() => {
    return alertRows.filter(
      (item) => String(item.archived || "").toLowerCase() !== "true"
    );
  }, [alertRows]);

  const openAlerts = useMemo(() => {
    return visibleAlerts.filter(
      (item) => String(item.status || "open").toLowerCase() !== "closed"
    );
  }, [visibleAlerts]);

  const selectedAlert = useMemo(() => {
    return visibleAlerts.find((a) => a.id === selectedAlertId) || null;
  }, [visibleAlerts, selectedAlertId]);

  const selectedReport = useMemo(() => {
    return visibleReports.find((r) => r.id === selectedReportId) || null;
  }, [visibleReports, selectedReportId]);

  const selectedInventory = useMemo(() => {
    return inventoryRows.find((r) => r.id === selectedInventoryId) || null;
  }, [inventoryRows, selectedInventoryId]);

  useEffect(() => {
    if (!selectedReport && visibleReports.length) {
      setSelectedReportId(visibleReports[0].id);
    }
  }, [visibleReports, selectedReport]);

  useEffect(() => {
    if (!selectedAlert && openAlerts.length) {
      setSelectedAlertId(openAlerts[0].id);
    }
  }, [openAlerts, selectedAlert]);

  useEffect(() => {
    if (!selectedInventory && inventoryRows.length) {
      setSelectedInventoryId(inventoryRows[0].id);
    }
  }, [inventoryRows, selectedInventory]);

  useEffect(() => {
    if (!selectedAlert) {
      setAlertEdit({
        assignedManagerName: "",
        managerNotes: "",
        followUpStatus: "submitted",
        estimatedRestockDate: "",
        actualReplacementDate: "",
        restockInProgressMessage: "",
      });
      return;
    }

    setAlertEdit({
      assignedManagerName:
        selectedAlert.assignedManagerName || getVisibleUserName(user),
      managerNotes: selectedAlert.managerNotes || "",
      followUpStatus: selectedAlert.followUpStatus || "submitted",
      estimatedRestockDate: selectedAlert.estimatedRestockDate || "",
      actualReplacementDate: selectedAlert.actualReplacementDate || "",
      restockInProgressMessage: selectedAlert.restockInProgressMessage || "",
    });

    if (selectedAlert.reportId) {
      setSelectedReportId(selectedAlert.reportId);
    }
  }, [selectedAlert, user]);

  useEffect(() => {
    if (!selectedReport) {
      setReportEdit({
        reviewStatus: "submitted",
        managerNotes: "",
        followUpAction: "",
        followUpDetails: "",
      });
      return;
    }

    setReportEdit({
      reviewStatus: selectedReport.reviewStatus || "submitted",
      managerNotes: selectedReport.managerNotes || "",
      followUpAction: selectedReport.followUpAction || "",
      followUpDetails: selectedReport.followUpDetails || "",
    });
  }, [selectedReport]);

  const handleInventoryDraftChange = (id, field, value) => {
    setInventoryDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const getInventoryField = (row, field) => {
    return inventoryDrafts[row.id]?.[field] ?? row[field] ?? "";
  };

  const createInitialInventory = async () => {
    try {
      setCreatingInventory(true);

      const createdDocs = [];

      for (const item of DEFAULT_INVENTORY_ITEMS) {
        const payload = {
          productKey: item.productKey,
          productLabel: item.productLabel,
          stockQty: 0,
          minimumQty: safeNumber(item.minimumQty),
          unit: item.unit,
          location: item.location,
          updatedAt: serverTimestamp(),
          updatedByName: getVisibleUserName(user),
        };

        const ref = await addDoc(
          collection(db, "regulated_garbage_inventory"),
          payload
        );

        createdDocs.push({
          id: ref.id,
          ...payload,
          updatedAt: new Date(),
        });
      }

      setInventoryRows(createdDocs);
      setStatusMessage("Inventory base created successfully.");
    } catch (err) {
      console.error("Error creating initial inventory:", err);
      setStatusMessage("Could not create initial inventory.");
    } finally {
      setCreatingInventory(false);
    }
  };

  const saveInventoryRow = async (row) => {
    try {
      setSavingInventoryId(row.id);

      const payload = {
        productKey: String(
          getInventoryField(row, "productKey") || row.productKey || ""
        ).trim(),
        productLabel: String(
          getInventoryField(row, "productLabel") || row.productLabel || ""
        ).trim(),
        stockQty: safeNumber(getInventoryField(row, "stockQty")),
        minimumQty: safeNumber(getInventoryField(row, "minimumQty")),
        unit: String(getInventoryField(row, "unit") || row.unit || "").trim(),
        location: String(
          getInventoryField(row, "location") || row.location || ""
        ).trim(),
        updatedAt: serverTimestamp(),
        updatedByName: getVisibleUserName(user),
      };

      await updateDoc(doc(db, "regulated_garbage_inventory", row.id), payload);

      setInventoryRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                ...payload,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setInventoryDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });

      setStatusMessage("Inventory updated successfully.");
    } catch (err) {
      console.error("Error saving inventory row:", err);
      setStatusMessage("Could not update inventory.");
    } finally {
      setSavingInventoryId("");
    }
  };

  const approveReport = async (report) => {
    try {
      setSavingReportId(report.id);

      const payload = {
        reviewStatus: "approved",
        reviewedBy: getVisibleUserName(user),
        reviewedAt: serverTimestamp(),
        managerNotes: String(reportEdit.managerNotes || "").trim(),
        followUpAction: String(reportEdit.followUpAction || "").trim(),
        followUpDetails: String(reportEdit.followUpDetails || "").trim(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "regulated_garbage_reports", report.id), payload);

      setReportRows((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                reviewedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Report approved successfully.");
    } catch (err) {
      console.error("Error approving report:", err);
      setStatusMessage("Could not approve report.");
    } finally {
      setSavingReportId("");
    }
  };

  const followUpReport = async (report) => {
    try {
      setSavingReportId(report.id);

      const payload = {
        reviewStatus: "follow_up",
        followUpRequired: true,
        reviewedBy: getVisibleUserName(user),
        reviewedAt: serverTimestamp(),
        managerNotes: String(reportEdit.managerNotes || "").trim(),
        followUpAction: String(reportEdit.followUpAction || "").trim() || "Follow Up",
        followUpDetails: String(reportEdit.followUpDetails || "").trim(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "regulated_garbage_reports", report.id), payload);

      setReportRows((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                reviewedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Report marked for follow up.");
    } catch (err) {
      console.error("Error updating report follow up:", err);
      setStatusMessage("Could not update report.");
    } finally {
      setSavingReportId("");
    }
  };

  const archiveReport = async (report) => {
    try {
      await updateDoc(doc(db, "regulated_garbage_reports", report.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: getVisibleUserName(user),
      });

      setReportRows((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                archived: true,
              }
            : item
        )
      );

      setSelectedReportId("");
      setStatusMessage("Report archived successfully.");
    } catch (err) {
      console.error("Error archiving report:", err);
      setStatusMessage("Could not archive report.");
    }
  };

  const deleteReportPermanently = async (report) => {
    const ok = window.confirm("Delete this report permanently?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "regulated_garbage_reports", report.id));
      setReportRows((prev) => prev.filter((item) => item.id !== report.id));
      setSelectedReportId("");
      setStatusMessage("Report deleted successfully.");
    } catch (err) {
      console.error("Error deleting report:", err);
      setStatusMessage("Could not delete report.");
    }
  };

  const saveAlertFollowUp = async () => {
    if (!selectedAlert) return;

    try {
      setSavingAlertId(selectedAlert.id);

      const managerName =
        String(alertEdit.assignedManagerName || "").trim() ||
        getVisibleUserName(user);

      let nextStatus = "processing";

      if (alertEdit.followUpStatus === "restock_in_place") {
        nextStatus = "restock_in_place";
      }

      if (alertEdit.followUpStatus === "closed") {
        nextStatus = "closed";
      }

      if (alertEdit.followUpStatus === "assigned") {
        nextStatus = "assigned";
      }

      const payload = {
        assignedManagerName: managerName,
        assignedManagerId: user?.id || "",
        managerNotes: String(alertEdit.managerNotes || "").trim(),
        followUpStatus: alertEdit.followUpStatus || "processing",
        estimatedRestockDate: alertEdit.estimatedRestockDate || "",
        actualReplacementDate: alertEdit.actualReplacementDate || "",
        restockInProgressMessage:
          String(alertEdit.restockInProgressMessage || "").trim() ||
          `Replacement in progress. Management team has been informed by ${
            selectedAlert.reportedBySupervisorName || "Supervisor"
          }.`,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(
        doc(db, "regulated_garbage_supply_alerts", selectedAlert.id),
        payload
      );

      setAlertRows((prev) =>
        prev.map((item) =>
          item.id === selectedAlert.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      if (selectedAlert.reportId) {
        const reportPayload = {
          managerNotes: String(alertEdit.managerNotes || "").trim(),
          followUpRequired: nextStatus !== "closed",
          followUpAction:
            alertEdit.followUpStatus === "restock_in_place"
              ? "Restock in place"
              : alertEdit.followUpStatus === "closed"
              ? "Closed"
              : alertEdit.followUpStatus === "assigned"
              ? "Assigned"
              : "Processing",
          followUpDetails:
            String(alertEdit.restockInProgressMessage || "").trim() || "",
          reviewedBy: managerName,
          reviewedAt: serverTimestamp(),
          reviewStatus:
            nextStatus === "closed"
              ? "closed"
              : nextStatus === "restock_in_place"
              ? "processing"
              : nextStatus === "assigned"
              ? "follow_up"
              : "processing",
          restockStatus:
            nextStatus === "closed"
              ? "back_in_stock"
              : nextStatus === "restock_in_place"
              ? "restock_in_place"
              : "processing",
          closedBy: nextStatus === "closed" ? managerName : "",
          closedAt: nextStatus === "closed" ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        };

        await updateDoc(
          doc(db, "regulated_garbage_reports", selectedAlert.reportId),
          reportPayload
        );

        setReportRows((prev) =>
          prev.map((item) =>
            item.id === selectedAlert.reportId
              ? {
                  ...item,
                  ...reportPayload,
                }
              : item
          )
        );
      }

      setStatusMessage("Alert follow up updated successfully.");
    } catch (err) {
      console.error("Error updating alert follow up:", err);
      setStatusMessage("Could not update alert follow up.");
    } finally {
      setSavingAlertId("");
    }
  };

  const closeAlert = async () => {
    if (!selectedAlert) return;

    try {
      setSavingAlertId(selectedAlert.id);

      const managerName = getVisibleUserName(user);

      await updateDoc(
        doc(db, "regulated_garbage_supply_alerts", selectedAlert.id),
        {
          status: "closed",
          followUpStatus: "closed",
          actualReplacementDate: alertEdit.actualReplacementDate || "",
          assignedManagerName:
            String(alertEdit.assignedManagerName || "").trim() || managerName,
          assignedManagerId: user?.id || "",
          managerNotes: String(alertEdit.managerNotes || "").trim(),
          updatedAt: serverTimestamp(),
        }
      );

      setAlertRows((prev) =>
        prev.map((item) =>
          item.id === selectedAlert.id
            ? {
                ...item,
                status: "closed",
                followUpStatus: "closed",
                actualReplacementDate: alertEdit.actualReplacementDate || "",
                assignedManagerName:
                  String(alertEdit.assignedManagerName || "").trim() || managerName,
                assignedManagerId: user?.id || "",
                managerNotes: String(alertEdit.managerNotes || "").trim(),
              }
            : item
        )
      );

      if (selectedAlert.reportId) {
        await updateDoc(doc(db, "regulated_garbage_reports", selectedAlert.reportId), {
          reviewStatus: "closed",
          restockStatus: "back_in_stock",
          followUpRequired: false,
          followUpAction: "Closed - Back in stock",
          followUpDetails: String(alertEdit.managerNotes || "").trim(),
          managerNotes: String(alertEdit.managerNotes || "").trim(),
          reviewedBy: managerName,
          reviewedAt: serverTimestamp(),
          closedBy: managerName,
          closedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setReportRows((prev) =>
          prev.map((item) =>
            item.id === selectedAlert.reportId
              ? {
                  ...item,
                  reviewStatus: "closed",
                  restockStatus: "back_in_stock",
                  followUpRequired: false,
                  followUpAction: "Closed - Back in stock",
                  followUpDetails: String(alertEdit.managerNotes || "").trim(),
                  managerNotes: String(alertEdit.managerNotes || "").trim(),
                  reviewedBy: managerName,
                  closedBy: managerName,
                }
              : item
          )
        );
      }

      setStatusMessage("Alert closed and removed from active tracking.");
    } catch (err) {
      console.error("Error closing alert:", err);
      setStatusMessage("Could not close alert.");
    } finally {
      setSavingAlertId("");
    }
  };

  const archiveAlert = async (alert) => {
    try {
      await updateDoc(doc(db, "regulated_garbage_supply_alerts", alert.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: getVisibleUserName(user),
      });

      setAlertRows((prev) =>
        prev.map((item) =>
          item.id === alert.id
            ? {
                ...item,
                archived: true,
              }
            : item
        )
      );

      setSelectedAlertId("");
      setStatusMessage("Alert archived successfully.");
    } catch (err) {
      console.error("Error archiving alert:", err);
      setStatusMessage("Could not archive alert.");
    }
  };

  const deleteAlertPermanently = async (alert) => {
    const ok = window.confirm("Delete this alert permanently?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "regulated_garbage_supply_alerts", alert.id));
      setAlertRows((prev) => prev.filter((item) => item.id !== alert.id));
      setSelectedAlertId("");
      setStatusMessage("Alert deleted successfully.");
    } catch (err) {
      console.error("Error deleting alert:", err);
      setStatusMessage("Could not delete alert.");
    }
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
          TPA OPS · Regulated Garbage Admin
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
          Regulated Garbage Reports, Inventory & Alerts
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Review received reports, manage inventory, process alerts, approve or
          follow up, and archive or delete records when needed.
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TabButton
            active={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
          >
            Reportes Recibidos ({visibleReports.length})
          </TabButton>

          <TabButton
            active={activeTab === "inventory"}
            onClick={() => setActiveTab("inventory")}
          >
            Inventario ({inventoryRows.length})
          </TabButton>

          <TabButton
            active={activeTab === "alerts"}
            onClick={() => setActiveTab("alerts")}
          >
            Alertas ({openAlerts.length})
          </TabButton>
        </div>
      </PageCard>

      {activeTab === "reports" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedReport
              ? "minmax(320px, 0.95fr) minmax(520px, 1.25fr)"
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
              Reportes Recibidos
            </h2>

            {loading ? (
              <div>Loading...</div>
            ) : visibleReports.length === 0 ? (
              <div>No reports received.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {visibleReports.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedReportId(item.id)}
                    style={{
                      cursor: "pointer",
                      border:
                        item.id === selectedReport?.id
                          ? "1px solid #bfe0fb"
                          : "1px solid #e2e8f0",
                      background: item.id === selectedReport?.id ? "#edf7ff" : "#fff",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{item.productLabel || item.airline || "Report"}</span>
                      <span style={getStatusPill(item.reviewStatus || "submitted")}>
                        {item.reviewStatus || "submitted"}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        marginTop: 4,
                      }}
                    >
                      {item.airline || "—"} · {item.internationalCart || item.cartType || "—"} ·{" "}
                      {item.reportDate || "—"}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#1769aa",
                        marginTop: 4,
                        fontWeight: 700,
                      }}
                    >
                      Supervisor: {item.supervisorName || item.reportedBySupervisorName || "—"}
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
                    {selectedReport.airline || "—"} ·{" "}
                    {selectedReport.internationalCart || selectedReport.cartType || "—"} ·{" "}
                    {selectedReport.reportDate || "—"}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <TextInfoCard
                    label="Supervisor"
                    value={selectedReport.supervisorName || selectedReport.reportedBySupervisorName || "—"}
                  />
                  <TextInfoCard
                    label="Created"
                    value={formatDateTime(selectedReport.createdAt)}
                  />
                  <TextInfoCard
                    label="Review Status"
                    value={selectedReport.reviewStatus || "submitted"}
                  />
                  <TextInfoCard
                    label="Restock Status"
                    value={selectedReport.restockStatus || "—"}
                  />
                </div>

                <div>
                  <FieldLabel>Manager Notes</FieldLabel>
                  <TextArea
                    value={reportEdit.managerNotes}
                    onChange={(e) =>
                      setReportEdit((prev) => ({
                        ...prev,
                        managerNotes: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Follow Up Action</FieldLabel>
                  <TextInput
                    value={reportEdit.followUpAction}
                    onChange={(e) =>
                      setReportEdit((prev) => ({
                        ...prev,
                        followUpAction: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Follow Up Details</FieldLabel>
                  <TextArea
                    value={reportEdit.followUpDetails}
                    onChange={(e) =>
                      setReportEdit((prev) => ({
                        ...prev,
                        followUpDetails: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    variant="success"
                    onClick={() => approveReport(selectedReport)}
                    disabled={savingReportId === selectedReport.id}
                  >
                    {savingReportId === selectedReport.id ? "Saving..." : "Approve"}
                  </ActionButton>

                  <ActionButton
                    variant="warning"
                    onClick={() => followUpReport(selectedReport)}
                    disabled={savingReportId === selectedReport.id}
                  >
                    {savingReportId === selectedReport.id ? "Saving..." : "Follow Up"}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={() => archiveReport(selectedReport)}
                  >
                    Archive
                  </ActionButton>

                  <ActionButton
                    variant="danger"
                    onClick={() => deleteReportPermanently(selectedReport)}
                  >
                    Delete
                  </ActionButton>
                </div>

                <div
                  style={{
                    borderRadius: 16,
                    padding: "14px 16px",
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    whiteSpace: "pre-line",
                    lineHeight: 1.7,
                    color: "#0f172a",
                  }}
                >
                  <strong>Full Report:</strong>
                  {"\n\n"}
                  {JSON.stringify(selectedReport, null, 2)}
                </div>
              </div>
            </PageCard>
          )}
        </div>
      )}

      {activeTab === "inventory" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedInventory
              ? "minmax(320px, 0.95fr) minmax(520px, 1.25fr)"
              : "1fr",
            gap: 18,
          }}
        >
          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Inventario
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Click one item to open and edit full inventory information.
                </p>
              </div>

              {inventoryRows.length === 0 && !loading && (
                <ActionButton
                  variant="primary"
                  onClick={createInitialInventory}
                  disabled={creatingInventory}
                >
                  {creatingInventory ? "Creating..." : "Create Initial Inventory"}
                </ActionButton>
              )}
            </div>

            {loading ? (
              <div>Loading...</div>
            ) : inventoryRows.length === 0 ? (
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
                No inventory exists yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {inventoryRows.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => setSelectedInventoryId(row.id)}
                    style={{
                      cursor: "pointer",
                      border:
                        row.id === selectedInventory?.id
                          ? "1px solid #bfe0fb"
                          : "1px solid #e2e8f0",
                      background: row.id === selectedInventory?.id ? "#edf7ff" : "#fff",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      {row.productLabel}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                      Qty: {safeNumber(row.stockQty)} · Min: {safeNumber(row.minimumQty)} ·{" "}
                      {row.location || "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageCard>

          {selectedInventory && (
            <PageCard style={{ padding: 20 }}>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    Inventory Detail
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    Edit and save this inventory item.
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Product</FieldLabel>
                    <TextInput
                      value={getInventoryField(selectedInventory, "productLabel")}
                      onChange={(e) =>
                        handleInventoryDraftChange(
                          selectedInventory.id,
                          "productLabel",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Stock Qty</FieldLabel>
                    <TextInput
                      type="number"
                      value={getInventoryField(selectedInventory, "stockQty")}
                      onChange={(e) =>
                        handleInventoryDraftChange(
                          selectedInventory.id,
                          "stockQty",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Minimum Qty</FieldLabel>
                    <TextInput
                      type="number"
                      value={getInventoryField(selectedInventory, "minimumQty")}
                      onChange={(e) =>
                        handleInventoryDraftChange(
                          selectedInventory.id,
                          "minimumQty",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Unit</FieldLabel>
                    <TextInput
                      value={getInventoryField(selectedInventory, "unit")}
                      onChange={(e) =>
                        handleInventoryDraftChange(selectedInventory.id, "unit", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Location</FieldLabel>
                    <TextInput
                      value={getInventoryField(selectedInventory, "location")}
                      onChange={(e) =>
                        handleInventoryDraftChange(
                          selectedInventory.id,
                          "location",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Last Updated</FieldLabel>
                    <TextInput
                      value={formatDateTime(selectedInventory.updatedAt)}
                      disabled
                    />
                  </div>
                </div>

                <div>
                  <ActionButton
                    variant="secondary"
                    onClick={() => saveInventoryRow(selectedInventory)}
                    disabled={savingInventoryId === selectedInventory.id}
                  >
                    {savingInventoryId === selectedInventory.id ? "Saving..." : "Save Inventory"}
                  </ActionButton>
                </div>
              </div>
            </PageCard>
          )}
        </div>
      )}

      {activeTab === "alerts" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              selectedAlert || selectedReport
                ? "minmax(320px, 0.95fr) minmax(520px, 1.25fr)"
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
              Alertas
            </h2>

            {openAlerts.length === 0 ? (
              <div>No active alerts.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {openAlerts.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedAlertId(item.id);
                      if (item.reportId) setSelectedReportId(item.reportId);
                    }}
                    style={{
                      cursor: "pointer",
                      border:
                        item.id === selectedAlert?.id
                          ? "1px solid #bfe0fb"
                          : "1px solid #e2e8f0",
                      background: item.id === selectedAlert?.id ? "#edf7ff" : "#fff",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{item.productLabel}</span>
                      <span style={getStatusPill(item.status)}>
                        {item.status || "open"}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        marginTop: 4,
                      }}
                    >
                      {item.airline || "—"} · {item.cartType || "—"} ·{" "}
                      {item.reportDate || "—"}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#1769aa",
                        marginTop: 4,
                        fontWeight: 700,
                      }}
                    >
                      Reported by {item.reportedBySupervisorName || "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageCard>

          {(selectedAlert || selectedReport) && (
            <PageCard style={{ padding: 20 }}>
              {selectedAlert && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      Alert Detail
                    </h2>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedAlert.productLabel} · {selectedAlert.airline || "—"} ·{" "}
                      {selectedAlert.cartType || "—"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <TextInfoCard
                      label="Alert Type"
                      value={selectedAlert.alertType || "—"}
                    />
                    <TextInfoCard
                      label="Office Stock at Submission"
                      value={safeNumber(selectedAlert.officeStockAtSubmission)}
                    />
                    <TextInfoCard
                      label="Estimated Restock"
                      value={selectedAlert.estimatedRestockDate || "—"}
                    />
                  </div>

                  <div>
                    <FieldLabel>Assigned Manager</FieldLabel>
                    <TextInput
                      value={alertEdit.assignedManagerName}
                      onChange={(e) =>
                        setAlertEdit((prev) => ({
                          ...prev,
                          assignedManagerName: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Manager Notes</FieldLabel>
                    <TextArea
                      value={alertEdit.managerNotes}
                      onChange={(e) =>
                        setAlertEdit((prev) => ({
                          ...prev,
                          managerNotes: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Follow Up Status</FieldLabel>
                    <SelectInput
                      value={alertEdit.followUpStatus}
                      onChange={(e) =>
                        setAlertEdit((prev) => ({
                          ...prev,
                          followUpStatus: e.target.value,
                        }))
                      }
                    >
                      <option value="submitted">Submitted</option>
                      <option value="assigned">Assigned</option>
                      <option value="processing">Processing</option>
                      <option value="restock_in_place">Restock In Place</option>
                      <option value="closed">Closed</option>
                    </SelectInput>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div>
                      <FieldLabel>Estimated Restock Date</FieldLabel>
                      <TextInput
                        type="date"
                        value={alertEdit.estimatedRestockDate}
                        onChange={(e) =>
                          setAlertEdit((prev) => ({
                            ...prev,
                            estimatedRestockDate: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Actual Replacement Date</FieldLabel>
                      <TextInput
                        type="date"
                        value={alertEdit.actualReplacementDate}
                        onChange={(e) =>
                          setAlertEdit((prev) => ({
                            ...prev,
                            actualReplacementDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Restock Progress Message</FieldLabel>
                    <TextArea
                      value={alertEdit.restockInProgressMessage}
                      onChange={(e) =>
                        setAlertEdit((prev) => ({
                          ...prev,
                          restockInProgressMessage: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton
                      variant="warning"
                      onClick={saveAlertFollowUp}
                      disabled={savingAlertId === selectedAlert.id}
                    >
                      {savingAlertId === selectedAlert.id
                        ? "Saving..."
                        : "Save Follow Up"}
                    </ActionButton>

                    <ActionButton
                      variant="success"
                      onClick={closeAlert}
                      disabled={savingAlertId === selectedAlert.id}
                    >
                      {savingAlertId === selectedAlert.id
                        ? "Closing..."
                        : "Close Alert"}
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={() => archiveAlert(selectedAlert)}
                    >
                      Archive
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={() => deleteAlertPermanently(selectedAlert)}
                    >
                      Delete
                    </ActionButton>
                  </div>

                  {selectedReport && (
                    <div
                      style={{
                        marginTop: 8,
                        borderTop: "1px solid #e2e8f0",
                        paddingTop: 16,
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        Linked Report
                      </h3>

                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 700,
                          }}
                        >
                          Submitted by {selectedReport.supervisorName || "—"} ·{" "}
                          {selectedReport.reportDate || "—"}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          {selectedReport.airline || "—"} ·{" "}
                          {selectedReport.internationalCart || "—"}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: "#334155",
                          }}
                        >
                          Review Status: {selectedReport.reviewStatus || "submitted"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </PageCard>
          )}
        </div>
      )}
    </div>
  );
}

function TextInfoCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: "12px 14px",
        background: "#f8fbff",
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
          fontWeight: 800,
          color: "#0f172a",
          whiteSpace: "pre-line",
        }}
      >
        {String(value ?? "—")}
      </div>
    </div>
  );
}
