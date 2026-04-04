import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

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

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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
        minHeight: 90,
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
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
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
  "Delta",
  "Avianca",
  "World Atlantic",
  "Eastern Express",
  "West Jet",
  "Sun Country",
  "Other",
];

const CART_OPTIONS = ["DL Cabin Service", "Dep International"];

const CHECKLIST_ITEMS = [
  { key: "disinfectant", label: "Disinfectant", inventoryKey: "disinfectant" },
  { key: "detergent", label: "Detergent", inventoryKey: "detergent" },
  { key: "clean_water", label: "Clean Water", inventoryKey: "clean_water" },
  {
    key: "whisk_broom_dustpan",
    label: "Whisk Broom / Dustpan",
    inventoryKey: "whisk_broom_dustpan",
  },
  { key: "scrub_brush", label: "Scrub Brush", inventoryKey: "scrub_brush" },
  { key: "zip_ties", label: "Zip Ties", inventoryKey: "zip_ties" },
  { key: "paper_towels", label: "Paper Towels", inventoryKey: "paper_towels" },
  {
    key: "ppe_goggles_gloves",
    label: "PPE (Goggles / Gloves)",
    inventoryKey: "ppe_goggles_gloves",
  },
  {
    key: "spill_kit_contents_copy",
    label: "Copy of Spill Kit Contents",
    inventoryKey: "spill_kit_contents_copy",
  },
  { key: "plastic_bags", label: "Plastic Bags", inventoryKey: "plastic_bags" },
];

function buildInitialItems() {
  const map = {};
  CHECKLIST_ITEMS.forEach((item) => {
    map[item.key] = {
      available: "",
      replacementDate: "",
      cannotReplaceReason: "",
      estimatedRestockDate: "",
      collectedFromOffice: false,
      officeStockAtSubmission: 0,
      additionalNotes: "",
    };
  });

  map.orange_bags_quantity = {
    quantityOnCart: "",
    lowStockReason: "",
    replacementDate: "",
    cannotReplaceReason: "",
    estimatedRestockDate: "",
    collectedFromOffice: false,
    officeStockAtSubmission: 0,
    additionalNotes: "",
  };

  return map;
}

function ModalShell({ title, tone = "info", children }) {
  const toneStyles = {
    info: {
      headerBg: "#edf7ff",
      headerBorder: "#cfe7fb",
      headerColor: "#1769aa",
    },
    warning: {
      headerBg: "#fff7ed",
      headerBorder: "#fdba74",
      headerColor: "#9a3412",
    },
    success: {
      headerBg: "#ecfdf5",
      headerBorder: "#a7f3d0",
      headerColor: "#065f46",
    },
  };

  const current = toneStyles[tone] || toneStyles.info;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#ffffff",
          borderRadius: 24,
          boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            background: current.headerBg,
            borderBottom: `1px solid ${current.headerBorder}`,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: current.headerColor,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

export default function SupervisorRegulatedGarbagePage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [saving, setSaving] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [loadingMyReports, setLoadingMyReports] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [inventory, setInventory] = useState({});
  const [myReports, setMyReports] = useState([]);
  const [activeTab, setActiveTab] = useState("submit");

  const [missingQueue, setMissingQueue] = useState([]);
  const [activeMissingKey, setActiveMissingKey] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [form, setForm] = useState({
    reportDate: todayString(),
    airline: "",
    airlineOther: "",
    internationalCart: "",
    supervisorName: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    shift: "",
    notes: "",
    signature: "",
    photoUrl: "",
    items: buildInitialItems(),
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingInventory(true);
        setLoadingMyReports(true);

        const requests = [getDocs(collection(db, "regulated_garbage_inventory"))];

        if (user?.id) {
          requests.push(
            getDocs(
              query(
                collection(db, "regulated_garbage_reports"),
                where("submittedByUserId", "==", user.id)
              )
            )
          );
        }

        const [inventorySnap, reportsSnap] = await Promise.all(requests);

        const inventoryMap = {};
        inventorySnap.docs.forEach((d) => {
          const data = d.data();
          inventoryMap[data.productKey] = {
            id: d.id,
            ...data,
            stockQty: safeNumber(data.stockQty),
            minimumQty: safeNumber(data.minimumQty),
          };
        });

        const reports = reportsSnap
          ? reportsSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const ta = a.createdAt?.seconds || 0;
                const tb = b.createdAt?.seconds || 0;
                return tb - ta;
              })
          : [];

        setInventory(inventoryMap);
        setMyReports(reports);
      } catch (err) {
        console.error("Error loading regulated garbage data:", err);
        setStatusMessage("Could not load regulated garbage data.");
      } finally {
        setLoadingInventory(false);
        setLoadingMyReports(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoadingInventory(false);
      setLoadingMyReports(false);
    }
  }, [canAccess, user?.id]);

  const officeAlerts = useMemo(() => {
    const rows = [];

    CHECKLIST_ITEMS.forEach((item) => {
      const value = form.items[item.key];
      const stock = safeNumber(inventory[item.inventoryKey]?.stockQty);

      if (value?.available === "No" && stock > 0 && !value?.collectedFromOffice) {
        rows.push({
          key: item.key,
          text: `${item.label}: office inventory shows ${stock} available.`,
        });
      }
    });

    const orangeStock = safeNumber(inventory.orange_bags?.stockQty);
    const orangeQty = safeNumber(form.items.orange_bags_quantity?.quantityOnCart);

    if (String(form.items.orange_bags_quantity?.quantityOnCart || "").trim() !== "") {
      if (
        orangeQty < 10 &&
        orangeStock > 0 &&
        !form.items.orange_bags_quantity?.collectedFromOffice
      ) {
        rows.push({
          key: "orange_bags_quantity",
          text: `Orange Bags: low stock on cart (${orangeQty}). Office inventory shows ${orangeStock} available.`,
        });
      }
    }

    return rows;
  }, [form.items, inventory]);

  const currentAirlineLabel =
    form.airline === "Other" ? String(form.airlineOther || "").trim() : form.airline;

  const reportNeedsAttention = useMemo(() => {
    return officeAlerts.length > 0;
  }, [officeAlerts]);

  const resetForm = () => {
    setForm({
      reportDate: todayString(),
      airline: "",
      airlineOther: "",
      internationalCart: "",
      supervisorName: getVisibleName(user),
      supervisorPosition: user?.position || getDefaultPosition(user?.role),
      shift: "",
      notes: "",
      signature: "",
      photoUrl: "",
      items: buildInitialItems(),
    });
    setMissingQueue([]);
    setActiveMissingKey("");
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openMissingModal = (itemKey) => {
    setMissingQueue((prev) => {
      if (prev.includes(itemKey)) return prev;
      return [...prev, itemKey];
    });
    setActiveMissingKey((prev) => prev || itemKey);
  };

  const closeResolvedMissingModal = () => {
    if (!activeMissingKey) return;

    setMissingQueue((prev) => {
      const next = prev.filter((key) => key !== activeMissingKey);
      setActiveMissingKey(next[0] || "");
      return next;
    });
  };

  const validateMissingModal = (itemKey) => {
    const current = form.items[itemKey];
    if (!current) return true;

    if (!String(current.replacementDate || "").trim()) {
      setStatusMessage("Please add the replacement date before continuing.");
      return false;
    }

    if (current.replacementDate > form.reportDate) {
      if (!String(current.cannotReplaceReason || "").trim()) {
        setStatusMessage("Please explain why it cannot be replaced the same day.");
        return false;
      }

      if (!String(current.estimatedRestockDate || "").trim()) {
        setStatusMessage("Please estimate when it will be back on stock.");
        return false;
      }
    }

    return true;
  };

  const validateOrangeModal = () => {
    const current = form.items.orange_bags_quantity;

    if (!String(current.quantityOnCart || "").trim()) {
      setStatusMessage("Please enter Orange Bags quantity on cart.");
      return false;
    }

    const orangeQty = safeNumber(current.quantityOnCart);

    if (orangeQty < 10) {
      if (!String(current.replacementDate || "").trim()) {
        setStatusMessage("Please add replacement date for Orange Bags.");
        return false;
      }

      if (current.replacementDate > form.reportDate) {
        if (!String(current.cannotReplaceReason || "").trim()) {
          setStatusMessage(
            "Please explain why Orange Bags cannot be replaced the same day."
          );
          return false;
        }

        if (!String(current.estimatedRestockDate || "").trim()) {
          setStatusMessage("Please estimate when Orange Bags will be back in stock.");
          return false;
        }
      }
    }

    return true;
  };

  const handleItemChange = (itemKey, field, value) => {
    setForm((prev) => {
      const next = {
        ...prev,
        items: {
          ...prev.items,
          [itemKey]: {
            ...prev.items[itemKey],
            [field]: value,
          },
        },
      };

      return next;
    });

    if (field === "available" && value === "No") {
      openMissingModal(itemKey);
    }

    if (field === "available" && value === "Yes") {
      setMissingQueue((prev) => prev.filter((key) => key !== itemKey));
      if (activeMissingKey === itemKey) {
        setActiveMissingKey("");
      }
    }
  };

  const validateForm = () => {
    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return false;
    }

    if (!form.internationalCart) {
      setStatusMessage("Please select the International Cart.");
      return false;
    }

    if (!form.airline) {
      setStatusMessage("Please select the airline.");
      return false;
    }

    if (form.airline === "Other" && !String(form.airlineOther || "").trim()) {
      setStatusMessage("Please write the additional airline name.");
      return false;
    }

    if (!String(form.supervisorName || "").trim()) {
      setStatusMessage("Please enter supervisor name.");
      return false;
    }

    if (!String(form.signature || "").trim()) {
      setStatusMessage("Please sign the report before submitting.");
      return false;
    }

    for (const item of CHECKLIST_ITEMS) {
      const current = form.items[item.key];

      if (!current?.available) {
        setStatusMessage(`Please complete ${item.label}.`);
        return false;
      }

      if (current.available === "No") {
        if (!validateMissingModal(item.key)) {
          openMissingModal(item.key);
          return false;
        }
      }
    }

    const orangeQtyRaw = String(form.items.orange_bags_quantity?.quantityOnCart || "").trim();
    if (!orangeQtyRaw) {
      setStatusMessage("Please enter Orange Bags quantity on cart.");
      return false;
    }

    const orangeQty = safeNumber(orangeQtyRaw);

    if (orangeQty < 10) {
      if (!validateOrangeModal()) {
        setActiveMissingKey("orange_bags_quantity");
        if (!missingQueue.includes("orange_bags_quantity")) {
          setMissingQueue((prev) => [...prev, "orange_bags_quantity"]);
        }
        return false;
      }
    }

    return true;
  };

  const buildAlertPayloads = () => {
    const alerts = [];

    CHECKLIST_ITEMS.forEach((item) => {
      const current = form.items[item.key];
      const officeStock = safeNumber(inventory[item.inventoryKey]?.stockQty);

      if (current?.available === "No") {
        alerts.push({
          productKey: item.inventoryKey,
          productLabel: item.label,
          alertType: "missing_item",
          cartType: form.internationalCart,
          airline: currentAirlineLabel || "—",
          reportDate: form.reportDate,
          reportId: "",
          status: "open",
          assignedManagerName: "",
          assignedManagerId: "",
          managerNotes: "",
          followUpStatus: "submitted",
          replacementDateRequested: current.replacementDate || "",
          estimatedRestockDate: current.estimatedRestockDate || "",
          actualReplacementDate: "",
          cannotReplaceReason: current.cannotReplaceReason || "",
          officeStockAtSubmission: officeStock,
          reportedBySupervisorName: form.supervisorName,
          reportedBySupervisorId: user?.id || "",
          restockInProgressMessage:
            current.replacementDate && current.replacementDate > form.reportDate
              ? `Replacement in progress. Management team has been informed by ${form.supervisorName}.`
              : "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    const orangeQty = safeNumber(form.items.orange_bags_quantity?.quantityOnCart);
    const orangeOfficeStock = safeNumber(inventory.orange_bags?.stockQty);

    if (orangeQty < 10) {
      alerts.push({
        productKey: "orange_bags",
        productLabel: "Orange Bags",
        alertType: "low_stock",
        cartType: form.internationalCart,
        airline: currentAirlineLabel || "—",
        reportDate: form.reportDate,
        reportId: "",
        status: "open",
        assignedManagerName: "",
        assignedManagerId: "",
        managerNotes: "",
        followUpStatus: "submitted",
        replacementDateRequested:
          form.items.orange_bags_quantity?.replacementDate || "",
        estimatedRestockDate:
          form.items.orange_bags_quantity?.estimatedRestockDate || "",
        actualReplacementDate: "",
        cannotReplaceReason:
          form.items.orange_bags_quantity?.cannotReplaceReason || "",
        officeStockAtSubmission: orangeOfficeStock,
        reportedBySupervisorName: form.supervisorName,
        reportedBySupervisorId: user?.id || "",
        quantityOnCart: orangeQty,
        restockInProgressMessage:
          form.items.orange_bags_quantity?.replacementDate &&
          form.items.orange_bags_quantity.replacementDate > form.reportDate
            ? `Replacement in progress. Management team has been informed by ${form.supervisorName}.`
            : "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return alerts;
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!validateForm()) return;

    try {
      setSaving(true);

      const reportPayload = {
        reportDate: form.reportDate,
        airline: currentAirlineLabel || "",
        airlineBaseSelection: form.airline || "",
        airlineOther: form.airline === "Other" ? form.airlineOther || "" : "",
        internationalCart: form.internationalCart,
        supervisorName: form.supervisorName,
        supervisorPosition: form.supervisorPosition,
        shift: form.shift || "",
        notes: form.notes || "",
        signature: form.signature || "",
        photoUrl: form.photoUrl || "",
        items: form.items,
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        status: "submitted",
        reviewStatus: "submitted",
        managerNotes: "",
        followUpRequired: reportNeedsAttention,
        followUpAction: "",
        followUpDetails: "",
        reviewedBy: "",
        reviewedAt: null,
        closedBy: "",
        closedAt: null,
        restockStatus: reportNeedsAttention ? "processing" : "clear",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const reportRef = await addDoc(
        collection(db, "regulated_garbage_reports"),
        reportPayload
      );

      const alerts = buildAlertPayloads();

      if (alerts.length > 0) {
        await Promise.all(
          alerts.map((alert) =>
            addDoc(collection(db, "regulated_garbage_supply_alerts"), {
              ...alert,
              reportId: reportRef.id,
            })
          )
        );
      }

      resetForm();
      setShowSuccessModal(true);

      const reportsSnap = await getDocs(
        query(
          collection(db, "regulated_garbage_reports"),
          where("submittedByUserId", "==", user?.id || "__none__")
        )
      );

      const refreshedReports = reportsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return tb - ta;
        });

      setMyReports(refreshedReports);
    } catch (err) {
      console.error("Error submitting regulated garbage checklist:", err);
      setStatusMessage("Could not submit regulated garbage checklist.");
    } finally {
      setSaving(false);
    }
  };

  const currentModalItem = useMemo(() => {
    if (!activeMissingKey) return null;

    if (activeMissingKey === "orange_bags_quantity") {
      return {
        key: "orange_bags_quantity",
        label: "Orange Bags",
        inventoryKey: "orange_bags",
        isOrange: true,
      };
    }

    return CHECKLIST_ITEMS.find((item) => item.key === activeMissingKey) || null;
  }, [activeMissingKey]);

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
            TPA OPS · Regulated Garbage
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
            You do not have permission to submit regulated garbage checklists.
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
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                width: 90,
                height: 90,
                borderRadius: 20,
                overflow: "hidden",
                background: "rgba(255,255,255,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <img
                src="/regulated-garbage-logo.png"
                alt="Regulated Garbage"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "#fff",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>

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
              TPA OPS · Regulated Garbage
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
              Regulated Garbage Checklist
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Submit cart readiness, shortages, replacement dates, and stock alerts.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton variant="secondary" onClick={() => setActiveTab("submit")}>
              Submit Form
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => setActiveTab("my_reports")}
            >
              My Submitted Reports
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => navigate("/dashboard")}
            >
              ← Back to Dashboard
            </ActionButton>
          </div>
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

      {activeTab === "my_reports" ? (
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
              My Submitted Reports
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Track report status, manager notes, follow up and restock progress.
            </p>
          </div>

          {loadingMyReports ? (
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
              Loading submitted reports...
            </div>
          ) : myReports.length === 0 ? (
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
              No regulated garbage reports submitted yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {myReports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
                  }}
                >
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
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.airline || "—"} · {report.internationalCart || "—"}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        {report.reportDate || "—"} · Submitted{" "}
                        {formatDateTime(report.createdAt)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "7px 12px",
                        borderRadius: 999,
                        background: "#edf7ff",
                        border: "1px solid #cfe7fb",
                        color: "#1769aa",
                        fontWeight: 800,
                        fontSize: 12,
                        textTransform: "uppercase",
                      }}
                    >
                      {report.reviewStatus || report.status || "submitted"}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
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
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Processing Status
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.restockStatus || "processing"}
                      </div>
                    </div>

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
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Worked By
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.reviewedBy || report.closedBy || "—"}
                      </div>
                    </div>

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
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Follow Up Required
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.followUpRequired ? "Yes" : "No"}
                      </div>
                    </div>
                  </div>

                  {report.managerNotes && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: "#fff7ed",
                        border: "1px solid #fdba74",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#9a3412",
                          textTransform: "uppercase",
                          marginBottom: 6,
                        }}
                      >
                        Manager Notes
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#7c2d12",
                          whiteSpace: "pre-line",
                          lineHeight: 1.7,
                          fontWeight: 700,
                        }}
                      >
                        {report.managerNotes}
                      </div>
                    </div>
                  )}

                  {report.followUpAction && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#047857",
                          textTransform: "uppercase",
                          marginBottom: 6,
                        }}
                      >
                        Follow Up Action
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#065f46",
                          whiteSpace: "pre-line",
                          lineHeight: 1.7,
                          fontWeight: 700,
                        }}
                      >
                        {report.followUpAction}
                      </div>
                    </div>
                  )}

                  {report.followUpDetails && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          marginBottom: 6,
                        }}
                      >
                        Additional Follow Up Details
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#0f172a",
                          whiteSpace: "pre-line",
                          lineHeight: 1.7,
                        }}
                      >
                        {report.followUpDetails}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PageCard>
      ) : (
        <>
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
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <FieldLabel>Report Date</FieldLabel>
                <TextInput
                  type="date"
                  value={form.reportDate}
                  onChange={(e) => handleFieldChange("reportDate", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>International Cart</FieldLabel>
                <SelectInput
                  value={form.internationalCart}
                  onChange={(e) => handleFieldChange("internationalCart", e.target.value)}
                >
                  <option value="">Select cart</option>
                  {CART_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>Airline</FieldLabel>
                <SelectInput
                  value={form.airline}
                  onChange={(e) => handleFieldChange("airline", e.target.value)}
                >
                  <option value="">Select airline</option>
                  {AIRLINE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
              </div>

              {form.airline === "Other" && (
                <div>
                  <FieldLabel>Additional Airline</FieldLabel>
                  <TextInput
                    value={form.airlineOther}
                    onChange={(e) => handleFieldChange("airlineOther", e.target.value)}
                    placeholder="Write airline name"
                  />
                </div>
              )}

              <div>
                <FieldLabel>Supervisor Name</FieldLabel>
                <TextInput
                  value={form.supervisorName}
                  onChange={(e) => handleFieldChange("supervisorName", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Shift</FieldLabel>
                <TextInput
                  value={form.shift}
                  onChange={(e) => handleFieldChange("shift", e.target.value)}
                  placeholder="AM / PM / MID"
                />
              </div>

              <div>
                <FieldLabel>Photo URL (optional)</FieldLabel>
                <TextInput
                  value={form.photoUrl}
                  onChange={(e) => handleFieldChange("photoUrl", e.target.value)}
                  placeholder="Paste uploaded image URL"
                />
              </div>

              <div>
                <FieldLabel>Signature</FieldLabel>
                <TextInput
                  value={form.signature}
                  onChange={(e) => handleFieldChange("signature", e.target.value)}
                  placeholder="Supervisor signature"
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <FieldLabel>General Notes</FieldLabel>
              <TextArea
                value={form.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </PageCard>

          {officeAlerts.length > 0 && (
            <PageCard style={{ padding: 18 }}>
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  borderRadius: 18,
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#9a3412",
                    marginBottom: 8,
                  }}
                >
                  Office Inventory Alerts
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {officeAlerts.map((alert) => (
                    <div
                      key={alert.key}
                      style={{
                        color: "#9a3412",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {alert.text}
                    </div>
                  ))}
                </div>
              </div>
            </PageCard>
          )}

          <PageCard style={{ padding: 18 }}>
            <div style={{ marginBottom: 14 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Regulated Garbage Checklist
              </h2>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              {CHECKLIST_ITEMS.map((item) => {
                const current = form.items[item.key];
                const officeStock = safeNumber(inventory[item.inventoryKey]?.stockQty);

                return (
                  <div
                    key={item.key}
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 14,
                      }}
                    >
                      <div>
                        <FieldLabel>{item.label}</FieldLabel>
                        <SelectInput
                          value={current.available}
                          onChange={(e) =>
                            handleItemChange(item.key, "available", e.target.value)
                          }
                        >
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </SelectInput>
                      </div>

                      <div>
                        <FieldLabel>Office Inventory</FieldLabel>
                        <TextInput value={String(officeStock)} disabled />
                      </div>
                    </div>

                    {current.available === "No" && (
                      <div
                        style={{
                          marginTop: 14,
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#fff7ed",
                          border: "1px solid #fdba74",
                          color: "#9a3412",
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        This item requires mandatory follow-up details. Complete the popup in the center to continue.
                      </div>
                    )}
                  </div>
                );
              })}

              <div
                style={{
                  borderRadius: 18,
                  padding: 16,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Orange Bags Quantity on Cart</FieldLabel>
                    <TextInput
                      type="number"
                      min="0"
                      value={form.items.orange_bags_quantity.quantityOnCart}
                      onChange={(e) => {
                        const value = e.target.value;
                        handleItemChange(
                          "orange_bags_quantity",
                          "quantityOnCart",
                          value
                        );

                        if (
                          String(value || "").trim() !== "" &&
                          safeNumber(value) < 10
                        ) {
                          setMissingQueue((prev) => {
                            if (prev.includes("orange_bags_quantity")) return prev;
                            return [...prev, "orange_bags_quantity"];
                          });
                          setActiveMissingKey((prev) => prev || "orange_bags_quantity");
                        }
                      }}
                    />
                  </div>

                  <div>
                    <FieldLabel>Office Orange Bags</FieldLabel>
                    <TextInput
                      value={String(safeNumber(inventory.orange_bags?.stockQty))}
                      disabled
                    />
                  </div>
                </div>

                {safeNumber(form.items.orange_bags_quantity.quantityOnCart) < 10 &&
                  String(form.items.orange_bags_quantity.quantityOnCart || "").trim() !== "" && (
                    <div
                      style={{
                        marginTop: 14,
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: "#fff7ed",
                        border: "1px solid #fdba74",
                        color: "#9a3412",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      Orange Bags are below minimum. Complete the mandatory popup in the center to continue.
                    </div>
                  )}
              </div>
            </div>
          </PageCard>

          <PageCard style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <ActionButton
                onClick={handleSubmit}
                variant="primary"
                disabled={saving || loadingInventory || !!activeMissingKey}
              >
                {saving ? "Submitting..." : "Submit Regulated Garbage Checklist"}
              </ActionButton>

              <ActionButton onClick={resetForm} variant="secondary">
                Clear
              </ActionButton>
            </div>
          </PageCard>
        </>
      )}

      {currentModalItem && (
        <ModalShell
          title={
            currentModalItem.isOrange
              ? "Orange Bags Follow Up Required"
              : `${currentModalItem.label} Follow Up Required`
          }
          tone="warning"
        >
          <div style={{ display: "grid", gap: 14 }}>
            {currentModalItem.isOrange ? (
              <>
                <div
                  style={{
                    fontSize: 14,
                    color: "#9a3412",
                    fontWeight: 700,
                    lineHeight: 1.6,
                  }}
                >
                  Orange Bags are below minimum. You must complete these fields before continuing.
                </div>

                <div>
                  <FieldLabel>Low Stock Reason</FieldLabel>
                  <TextArea
                    value={form.items.orange_bags_quantity.lowStockReason}
                    onChange={(e) =>
                      handleItemChange(
                        "orange_bags_quantity",
                        "lowStockReason",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Replacement Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={form.items.orange_bags_quantity.replacementDate}
                      onChange={(e) =>
                        handleItemChange(
                          "orange_bags_quantity",
                          "replacementDate",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Collected From Office</FieldLabel>
                    <SelectInput
                      value={
                        form.items.orange_bags_quantity.collectedFromOffice
                          ? "Yes"
                          : "No"
                      }
                      onChange={(e) =>
                        handleItemChange(
                          "orange_bags_quantity",
                          "collectedFromOffice",
                          e.target.value === "Yes"
                        )
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </SelectInput>
                  </div>
                </div>

                {form.items.orange_bags_quantity.replacementDate > form.reportDate && (
                  <>
                    <div>
                      <FieldLabel>Why can Orange Bags not be replaced today?</FieldLabel>
                      <TextArea
                        value={
                          form.items.orange_bags_quantity.cannotReplaceReason
                        }
                        onChange={(e) =>
                          handleItemChange(
                            "orange_bags_quantity",
                            "cannotReplaceReason",
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Estimated Back on Stock</FieldLabel>
                      <TextInput
                        type="date"
                        value={
                          form.items.orange_bags_quantity.estimatedRestockDate
                        }
                        onChange={(e) =>
                          handleItemChange(
                            "orange_bags_quantity",
                            "estimatedRestockDate",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </>
                )}

                <div>
                  <FieldLabel>Additional Notes</FieldLabel>
                  <TextArea
                    value={form.items.orange_bags_quantity.additionalNotes}
                    onChange={(e) =>
                      handleItemChange(
                        "orange_bags_quantity",
                        "additionalNotes",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ActionButton
                    variant="primary"
                    onClick={() => {
                      if (!validateOrangeModal()) return;
                      closeResolvedMissingModal();
                    }}
                  >
                    Save and Continue
                  </ActionButton>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 14,
                    color: "#9a3412",
                    fontWeight: 700,
                    lineHeight: 1.6,
                  }}
                >
                  This item is marked as <b>No</b>. Complete these fields before continuing.
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Replacement Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={form.items[currentModalItem.key].replacementDate}
                      onChange={(e) =>
                        handleItemChange(
                          currentModalItem.key,
                          "replacementDate",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Collected From Office</FieldLabel>
                    <SelectInput
                      value={
                        form.items[currentModalItem.key].collectedFromOffice
                          ? "Yes"
                          : "No"
                      }
                      onChange={(e) =>
                        handleItemChange(
                          currentModalItem.key,
                          "collectedFromOffice",
                          e.target.value === "Yes"
                        )
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </SelectInput>
                  </div>
                </div>

                {form.items[currentModalItem.key].replacementDate > form.reportDate && (
                  <>
                    <div>
                      <FieldLabel>Why can it not be replaced today?</FieldLabel>
                      <TextArea
                        value={
                          form.items[currentModalItem.key].cannotReplaceReason
                        }
                        onChange={(e) =>
                          handleItemChange(
                            currentModalItem.key,
                            "cannotReplaceReason",
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div>
                      <FieldLabel>Estimated Back on Stock</FieldLabel>
                      <TextInput
                        type="date"
                        value={
                          form.items[currentModalItem.key].estimatedRestockDate
                        }
                        onChange={(e) =>
                          handleItemChange(
                            currentModalItem.key,
                            "estimatedRestockDate",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </>
                )}

                <div>
                  <FieldLabel>Additional Notes</FieldLabel>
                  <TextArea
                    value={form.items[currentModalItem.key].additionalNotes}
                    onChange={(e) =>
                      handleItemChange(
                        currentModalItem.key,
                        "additionalNotes",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ActionButton
                    variant="primary"
                    onClick={() => {
                      if (!validateMissingModal(currentModalItem.key)) return;
                      closeResolvedMissingModal();
                    }}
                  >
                    Save and Continue
                  </ActionButton>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}

      {showSuccessModal && (
        <ModalShell title="Success" tone="success">
          <div
            style={{
              display: "grid",
              gap: 18,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              Regulated garbage checklist submitted successfully.
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <ActionButton
                variant="primary"
                onClick={() => {
                  setShowSuccessModal(false);
                  setActiveTab("my_reports");
                }}
              >
                OK
              </ActionButton>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
