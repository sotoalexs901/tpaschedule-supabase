import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

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
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
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
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
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
    user?.id ||
    "unknown"
  );
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function priorityBadge(priority) {
  const p = String(priority || "normal").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid transparent",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  if (p === "high") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  if (p === "medium") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  return {
    ...base,
    background: "#ecfdf5",
    color: "#065f46",
    borderColor: "#a7f3d0",
  };
}

function categoryBadge(category) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid #cfe7fb",
    background: "#edf7ff",
    color: "#1769aa",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
}

function getSafeFileName(name) {
  return String(name || "image")
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

export default function CrewAnnouncementsPage() {
  const { user } = useUser();

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [pinned, setPinned] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const [editingAnnouncementId, setEditingAnnouncementId] = useState("");
  const [editingAnnouncementImageUrl, setEditingAnnouncementImageUrl] = useState("");
  const [editingAnnouncementImagePath, setEditingAnnouncementImagePath] = useState("");
  const [editingAnnouncementImageContentType, setEditingAnnouncementImageContentType] =
    useState("");

  const [employeeOfMonthName, setEmployeeOfMonthName] = useState("");
  const [employeeOfMonthAirline, setEmployeeOfMonthAirline] = useState("");
  const [employeeOfMonthDepartment, setEmployeeOfMonthDepartment] = useState("");
  const [employeeOfMonthPosition, setEmployeeOfMonthPosition] = useState("");
  const [employeeOfMonthUsername, setEmployeeOfMonthUsername] = useState("");
  const [employeeOfMonthUserId, setEmployeeOfMonthUserId] = useState("");
  const [employeeOfMonthNote, setEmployeeOfMonthNote] = useState("");
  const [employeeOfMonthMonthLabel, setEmployeeOfMonthMonthLabel] = useState("");
  const [employeeOfMonthPhotoFile, setEmployeeOfMonthPhotoFile] = useState(null);
  const [employeeOfMonthPhotoPreview, setEmployeeOfMonthPhotoPreview] = useState("");
  const [employeeOfMonthSaving, setEmployeeOfMonthSaving] = useState(false);
  const [employeeOfMonthCurrent, setEmployeeOfMonthCurrent] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [usersMapByUsername, setUsersMapByUsername] = useState({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(
    () => user?.position || getDefaultPosition(user?.role),
    [user]
  );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      if (
        employeeOfMonthPhotoPreview &&
        employeeOfMonthPhotoPreview.startsWith("blob:")
      ) {
        URL.revokeObjectURL(employeeOfMonthPhotoPreview);
      }
    };
  }, [imagePreviewUrl, employeeOfMonthPhotoPreview]);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const qAnn = query(
        collection(db, "employeeAnnouncements"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qAnn);
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading announcements:", err);
      setMessage("Error loading announcements. Check console.");
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeesAndUsers = async () => {
    try {
      const [employeesSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "users")),
      ]);

      const usersList = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const nextUsersMap = {};
      usersList.forEach((u) => {
        const usernameKey = normalizeLower(u.username);
        if (usernameKey) {
          nextUsersMap[usernameKey] = u;
        }
      });
      setUsersMapByUsername(nextUsersMap);

      const list = employeesSnap.docs.map((d) => {
        const emp = { id: d.id, ...d.data() };
        const linkedUser = nextUsersMap[normalizeLower(emp.loginUsername)] || null;

        return {
          ...emp,
          linkedUserId: linkedUser?.id || "",
          linkedProfilePhotoURL: linkedUser?.profilePhotoURL || "",
          linkedDisplayName:
            linkedUser?.displayName ||
            linkedUser?.fullName ||
            linkedUser?.name ||
            linkedUser?.username ||
            "",
        };
      });

      list.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );

      setEmployees(list);
    } catch (err) {
      console.error("Error loading employees/users:", err);
    }
  };

  const loadEmployeeOfMonth = async () => {
    try {
      const qEmployee = query(
        collection(db, "employee_of_month"),
        where("active", "==", true)
      );
      const snap = await getDocs(qEmployee);

      if (!snap.empty) {
        const docData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setEmployeeOfMonthCurrent(docData);
      } else {
        setEmployeeOfMonthCurrent(null);
      }
    } catch (err) {
      console.error("Error loading employee of month:", err);
    }
  };

  useEffect(() => {
    loadAnnouncements();
    loadEmployeesAndUsers();
    loadEmployeeOfMonth();
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;

    const found = employees.find((emp) => emp.id === selectedEmployeeId);
    if (!found) return;

    setEmployeeOfMonthName(found.name || "");
    setEmployeeOfMonthDepartment(found.department || "");
    setEmployeeOfMonthPosition(found.position || "");
    setEmployeeOfMonthUsername(found.loginUsername || "");
    setEmployeeOfMonthUserId(found.linkedUserId || "");

    if (!employeeOfMonthPhotoFile) {
      const linkedPhoto = found.linkedProfilePhotoURL || "";
      if (linkedPhoto) {
        setEmployeeOfMonthPhotoPreview(linkedPhoto);
      }
    }
  }, [selectedEmployeeId, employees, employeeOfMonthPhotoFile]);

  useEffect(() => {
    if (!employeeOfMonthUsername) {
      if (!selectedEmployeeId) {
        setEmployeeOfMonthUserId("");
      }
      return;
    }

    const linkedUser = usersMapByUsername[normalizeLower(employeeOfMonthUsername)];
    if (linkedUser) {
      setEmployeeOfMonthUserId(linkedUser.id || "");
      if (!employeeOfMonthPhotoFile && !employeeOfMonthPhotoPreview) {
        if (linkedUser.profilePhotoURL) {
          setEmployeeOfMonthPhotoPreview(linkedUser.profilePhotoURL);
        }
      }
    }
  }, [
    employeeOfMonthUsername,
    usersMapByUsername,
    employeeOfMonthPhotoFile,
    employeeOfMonthPhotoPreview,
    selectedEmployeeId,
  ]);

  const resetAnnouncementForm = () => {
    setTitle("");
    setSubtitle("");
    setBody("");
    setCategory("general");
    setPriority("normal");
    setPinned(false);
    setExpiresOn("");
    setEditingAnnouncementId("");
    setEditingAnnouncementImageUrl("");
    setEditingAnnouncementImagePath("");
    setEditingAnnouncementImageContentType("");
    resetImageInput();
  };

  const resetEmployeeOfMonthForm = () => {
    setSelectedEmployeeId("");
    setEmployeeOfMonthName("");
    setEmployeeOfMonthAirline("");
    setEmployeeOfMonthDepartment("");
    setEmployeeOfMonthPosition("");
    setEmployeeOfMonthUsername("");
    setEmployeeOfMonthUserId("");
    setEmployeeOfMonthNote("");
    setEmployeeOfMonthMonthLabel("");
    resetEmployeeOfMonthImage();
  };

  const resetImageInput = () => {
    setImageFile(null);
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl("");
    const input = document.getElementById("crew-announcement-image-input");
    if (input) input.value = "";
  };

  const resetEmployeeOfMonthImage = () => {
    setEmployeeOfMonthPhotoFile(null);
    if (
      employeeOfMonthPhotoPreview &&
      employeeOfMonthPhotoPreview.startsWith("blob:")
    ) {
      URL.revokeObjectURL(employeeOfMonthPhotoPreview);
    }
    setEmployeeOfMonthPhotoPreview("");
    const input = document.getElementById("employee-of-month-image-input");
    if (input) input.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!title.trim() && !body.trim()) {
      setMessage("Please enter at least a title or a message.");
      return;
    }

    try {
      setSaving(true);

      let imageUrl = editingAnnouncementImageUrl || "";
      let imagePath = editingAnnouncementImagePath || "";
      let imageContentType = editingAnnouncementImageContentType || "";

      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
          throw new Error("Please select a valid image file.");
        }

        if (imageFile.type === "image/heic" || imageFile.type === "image/heif") {
          throw new Error(
            "HEIC/HEIF images are not supported here. Please use JPG or PNG."
          );
        }

        if (imageFile.size > 5 * 1024 * 1024) {
          throw new Error("Image must be smaller than 5MB.");
        }

        const safeName = getSafeFileName(imageFile.name);
        imagePath = `employeeAnnouncements/${Date.now()}_${safeName}`;
        imageContentType = imageFile.type || "image/jpeg";

        const storageRef = ref(storage, imagePath);

        await uploadBytes(storageRef, imageFile, {
          contentType: imageContentType,
        });

        imageUrl = await getDownloadURL(storageRef);
      }

      const payload = {
        title: title.trim() || "Announcement",
        subtitle: subtitle.trim() || "",
        body: body.trim() || "",
        category,
        priority,
        pinned,
        expiresOn: expiresOn || "",
        imageUrl,
        imagePath,
        imageContentType,
        updatedAt: serverTimestamp(),
        updatedBy: visibleName,
        updatedByUsername: user?.username || "",
      };

      if (editingAnnouncementId) {
        await updateDoc(
          doc(db, "employeeAnnouncements", editingAnnouncementId),
          payload
        );
        setMessage("Announcement updated!");
      } else {
        await addDoc(collection(db, "employeeAnnouncements"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: visibleName,
          createdByUsername: user?.username || "",
          createdByRole: user?.role || "",
          createdByPosition: visiblePosition,
        });
        setMessage("Announcement posted!");
      }

      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (err) {
      console.error("Error saving announcement:", err);
      setMessage(err?.message || "Error saving announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditAnnouncement = (announcement) => {
    setTitle(announcement.title || "");
    setSubtitle(announcement.subtitle || "");
    setBody(announcement.body || "");
    setCategory(announcement.category || "general");
    setPriority(announcement.priority || "normal");
    setPinned(Boolean(announcement.pinned));
    setExpiresOn(announcement.expiresOn || "");
    setEditingAnnouncementId(announcement.id);
    setEditingAnnouncementImageUrl(announcement.imageUrl || "");
    setEditingAnnouncementImagePath(announcement.imagePath || "");
    setEditingAnnouncementImageContentType(announcement.imageContentType || "");
    resetImageInput();
    setMessage("Editing announcement.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEditAnnouncement = () => {
    resetAnnouncementForm();
    setMessage("Edit cancelled.");
  };

  const handleSaveEmployeeOfMonth = async () => {
    setMessage("");

    if (!employeeOfMonthName.trim()) {
      setMessage("Please select or enter employee name.");
      return;
    }

    try {
      setEmployeeOfMonthSaving(true);

      let photoURL = employeeOfMonthCurrent?.photoURL || "";
      let photoPath = employeeOfMonthCurrent?.photoPath || "";

      if (employeeOfMonthPhotoFile) {
        if (!employeeOfMonthPhotoFile.type.startsWith("image/")) {
          throw new Error("Please select a valid image file.");
        }

        if (employeeOfMonthPhotoFile.size > 5 * 1024 * 1024) {
          throw new Error("Employee of the month image must be smaller than 5MB.");
        }

        const safeName = getSafeFileName(employeeOfMonthPhotoFile.name);
        photoPath = `employeeOfMonth/${Date.now()}_${safeName}`;

        const storageRef = ref(storage, photoPath);
        await uploadBytes(storageRef, employeeOfMonthPhotoFile, {
          contentType: employeeOfMonthPhotoFile.type || "image/jpeg",
        });

        photoURL = await getDownloadURL(storageRef);
      } else if (
        employeeOfMonthPhotoPreview &&
        employeeOfMonthPhotoPreview.startsWith("http")
      ) {
        photoURL = employeeOfMonthPhotoPreview;
      } else {
        const linkedUser =
          usersMapByUsername[normalizeLower(employeeOfMonthUsername)] || null;
        if (linkedUser?.profilePhotoURL) {
          photoURL = linkedUser.profilePhotoURL;
        }
      }

      const linkedUser =
        usersMapByUsername[normalizeLower(employeeOfMonthUsername)] || null;

      const resolvedUserId = employeeOfMonthUserId || linkedUser?.id || "";
      const resolvedUsername =
        employeeOfMonthUsername.trim() || linkedUser?.username || "";

      const existingSnap = await getDocs(collection(db, "employee_of_month"));

      for (const item of existingSnap.docs) {
        await updateDoc(doc(db, "employee_of_month", item.id), {
          active: false,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "employee_of_month"), {
        active: true,
        employeeName: employeeOfMonthName.trim(),
        username: resolvedUsername,
        userId: resolvedUserId,
        airline: employeeOfMonthAirline.trim(),
        department: employeeOfMonthDepartment.trim(),
        position: employeeOfMonthPosition.trim(),
        note: employeeOfMonthNote.trim(),
        monthLabel: employeeOfMonthMonthLabel.trim(),
        photoURL,
        photoPath,
        selectedEmployeeId: selectedEmployeeId || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: visibleName,
        createdByUsername: user?.username || "",
      });

      setMessage("Employee of the month updated!");
      await loadEmployeeOfMonth();
    } catch (err) {
      console.error("Error saving employee of month:", err);
      setMessage(err?.message || "Error saving employee of the month.");
    } finally {
      setEmployeeOfMonthSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    const ok = window.confirm(
      "Delete this announcement? This action cannot be undone."
    );
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteDoc(doc(db, "employeeAnnouncements", id));
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));

      if (editingAnnouncementId === id) {
        resetAnnouncementForm();
      }

      setMessage("Announcement deleted.");
    } catch (err) {
      console.error("Error deleting announcement:", err);
      setMessage("Error deleting announcement.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    setMessage("");

    if (!file) {
      resetImageInput();
      return;
    }

    if (!file.type.startsWith("image/")) {
      resetImageInput();
      setMessage("Please select an image file (jpg, png, webp).");
      return;
    }

    if (file.type === "image/heic" || file.type === "image/heif") {
      resetImageInput();
      setMessage("HEIC/HEIF is not supported. Please convert it to JPG or PNG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      resetImageInput();
      setMessage("Image must be smaller than 5MB.");
      return;
    }

    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreviewUrl(preview);
  };

  const handleEmployeeOfMonthImageChange = (e) => {
    const file = e.target.files?.[0];
    setMessage("");

    if (!file) {
      resetEmployeeOfMonthImage();
      return;
    }

    if (!file.type.startsWith("image/")) {
      resetEmployeeOfMonthImage();
      setMessage("Please select an image file (jpg, png, webp).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      resetEmployeeOfMonthImage();
      setMessage("Image must be smaller than 5MB.");
      return;
    }

    if (
      employeeOfMonthPhotoPreview &&
      employeeOfMonthPhotoPreview.startsWith("blob:")
    ) {
      URL.revokeObjectURL(employeeOfMonthPhotoPreview);
    }

    const preview = URL.createObjectURL(file);
    setEmployeeOfMonthPhotoFile(file);
    setEmployeeOfMonthPhotoPreview(preview);
  };

  const success =
    message.toLowerCase().includes("posted") ||
    message.toLowerCase().includes("deleted") ||
    message.toLowerCase().includes("updated");

  if (!user || user.role !== "station_manager") {
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
            TPA OPS · Dashboard Editor
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
            Only Station Managers can manage employee dashboard content.
          </p>
        </div>

        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
              color: "#9f1239",
              fontWeight: 700,
            }}
          >
            You are not authorized to manage dashboard content.
          </div>
        </PageCard>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
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

        <div style={{ position: "relative" }}>
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
            TPA OPS · Dashboard Editor
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
            Employee Dashboard Content
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Manage crew announcements and Employee of the Month for the employee dashboard.
          </p>
        </div>
      </div>

      {message && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: success ? "#ecfdf5" : "#edf7ff",
              border: `1px solid ${success ? "#a7f3d0" : "#cfe7fb"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: success ? "#065f46" : "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {message}
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
            Employee of the Month
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Select the employee and details to display on the employee dashboard.
          </p>
        </div>

        {employeeOfMonthCurrent && (
          <div
            style={{
              marginBottom: 18,
              padding: 16,
              borderRadius: 18,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
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
              Current Employee of the Month
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {employeeOfMonthCurrent.employeeName || "—"}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "#9a3412",
                fontWeight: 700,
              }}
            >
              {employeeOfMonthCurrent.position || "—"} ·{" "}
              {employeeOfMonthCurrent.department || "—"}
            </div>
            {employeeOfMonthCurrent.username && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                @{employeeOfMonthCurrent.username}
              </div>
            )}
            {employeeOfMonthCurrent.monthLabel && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                {employeeOfMonthCurrent.monthLabel}
              </div>
            )}
            {employeeOfMonthCurrent.note && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                {employeeOfMonthCurrent.note}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Select Employee from Employee List</FieldLabel>
            <SelectInput
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name || "Unnamed"} {emp.department ? `· ${emp.department}` : ""}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Employee Name</FieldLabel>
            <TextInput
              value={employeeOfMonthName}
              onChange={(e) => setEmployeeOfMonthName(e.target.value)}
              placeholder="Employee name"
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
              <FieldLabel>Username</FieldLabel>
              <TextInput
                value={employeeOfMonthUsername}
                onChange={(e) => setEmployeeOfMonthUsername(e.target.value)}
                placeholder="Login username"
              />
            </div>

            <div>
              <FieldLabel>Position</FieldLabel>
              <TextInput
                value={employeeOfMonthPosition}
                onChange={(e) => setEmployeeOfMonthPosition(e.target.value)}
                placeholder="Agent, Supervisor, etc."
              />
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
              <FieldLabel>Airline</FieldLabel>
              <TextInput
                value={employeeOfMonthAirline}
                onChange={(e) => setEmployeeOfMonthAirline(e.target.value)}
                placeholder="Delta, Avianca, WestJet, etc."
              />
            </div>

            <div>
              <FieldLabel>Department</FieldLabel>
              <TextInput
                value={employeeOfMonthDepartment}
                onChange={(e) => setEmployeeOfMonthDepartment(e.target.value)}
                placeholder="Ramp, Cabin Service, WCHR, etc."
              />
            </div>
          </div>

          <div>
            <FieldLabel>Month Label</FieldLabel>
            <TextInput
              value={employeeOfMonthMonthLabel}
              onChange={(e) => setEmployeeOfMonthMonthLabel(e.target.value)}
              placeholder="April 2026"
            />
          </div>

          <div>
            <FieldLabel>Recognition Note</FieldLabel>
            <TextArea
              rows={4}
              value={employeeOfMonthNote}
              onChange={(e) => setEmployeeOfMonthNote(e.target.value)}
              placeholder="Excellent performance, attendance, teamwork..."
            />
          </div>

          <div>
            <FieldLabel>Photo (optional)</FieldLabel>
            <TextInput
              id="employee-of-month-image-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleEmployeeOfMonthImageChange}
              style={{ padding: "10px 12px" }}
            />

            {employeeOfMonthPhotoPreview && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  maxWidth: 260,
                  background: "#fff",
                }}
              >
                <img
                  src={employeeOfMonthPhotoPreview}
                  alt="Employee of the month preview"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 260,
                    objectFit: "cover",
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton
              variant="success"
              onClick={handleSaveEmployeeOfMonth}
              disabled={employeeOfMonthSaving}
            >
              {employeeOfMonthSaving ? "Saving..." : "Save Employee of the Month"}
            </ActionButton>

            <ActionButton variant="secondary" onClick={resetEmployeeOfMonthForm}>
              Clear
            </ActionButton>
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
            {editingAnnouncementId ? "Edit Announcement" : "Post Announcement"}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Create a visible notice for the dashboard with optional subtitle,
            image, category and priority.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: New parking policy, Holiday party, etc."
            />
          </div>

          <div>
            <FieldLabel>Subtitle (optional)</FieldLabel>
            <TextInput
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Short highlight or airline/department"
            />
          </div>

          <div>
            <FieldLabel>Message</FieldLabel>
            <TextArea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details for the crew..."
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Category</FieldLabel>
              <SelectInput
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="general">General</option>
                <option value="operations">Operations</option>
                <option value="schedule">Schedule</option>
                <option value="training">Training</option>
                <option value="event">Event</option>
                <option value="policy">Policy</option>
                <option value="wchr">WCHR</option>
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Priority</FieldLabel>
              <SelectInput
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Expires On (optional)</FieldLabel>
              <TextInput
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <input
              id="pinned-announcement"
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            <label
              htmlFor="pinned-announcement"
              style={{
                fontSize: 14,
                color: "#334155",
                fontWeight: 600,
              }}
            >
              Pin this announcement to dashboard
            </label>
          </div>

          <div>
            <FieldLabel>Image (optional)</FieldLabel>
            <TextInput
              id="crew-announcement-image-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleImageChange}
              style={{ padding: "10px 12px" }}
            />

            {editingAnnouncementImageUrl && !imagePreviewUrl && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  maxWidth: 380,
                  background: "#fff",
                }}
              >
                <img
                  src={editingAnnouncementImageUrl}
                  alt="Current announcement"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 260,
                    objectFit: "cover",
                  }}
                />
              </div>
            )}

            {imageFile && (
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                Selected: <b>{imageFile.name}</b>
              </p>
            )}

            {imagePreviewUrl && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  maxWidth: 380,
                  background: "#fff",
                }}
              >
                <img
                  src={imagePreviewUrl}
                  alt="Preview"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 260,
                    objectFit: "cover",
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton type="submit" variant="primary" disabled={saving}>
              {saving
                ? editingAnnouncementId
                  ? "Updating..."
                  : "Posting..."
                : editingAnnouncementId
                ? "Update announcement"
                : "Post announcement"}
            </ActionButton>

            {editingAnnouncementId && (
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleCancelEditAnnouncement}
              >
                Cancel edit
              </ActionButton>
            )}
          </div>
        </form>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
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
            Recent Announcements
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Review recent dashboard notices and edit or remove outdated ones.
          </p>
        </div>

        {loading && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading announcements...
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No announcements yet.
          </div>
        )}

        {!loading && announcements.length > 0 && (
          <div style={{ display: "grid", gap: 14 }}>
            {announcements.map((a) => (
              <div
                key={a.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 20,
                  padding: 18,
                  background: "#ffffff",
                  boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 8,
                      }}
                    >
                      <span style={categoryBadge(a.category)}>
                        {a.category || "general"}
                      </span>
                      <span style={priorityBadge(a.priority)}>
                        {a.priority || "normal"}
                      </span>
                      {a.pinned && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            border: "1px solid #bfdbfe",
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Pinned
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {a.title}
                    </h3>

                    {a.createdAt?.toDate && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {a.createdAt.toDate().toLocaleDateString()}
                      </p>
                    )}
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
                      onClick={() => handleEditAnnouncement(a)}
                    >
                      Edit
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={() => handleDeleteAnnouncement(a.id)}
                      disabled={deletingId === a.id}
                    >
                      {deletingId === a.id ? "Deleting..." : "Delete"}
                    </ActionButton>
                  </div>
                </div>

                {a.subtitle && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                      fontWeight: 600,
                    }}
                  >
                    {a.subtitle}
                  </p>
                )}

                {a.body && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 14,
                      color: "#334155",
                      lineHeight: 1.7,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {a.body}
                  </p>
                )}

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 4,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <span>
                    Posted by: <b>{a.createdBy || a.createdByUsername || "Unknown"}</b>
                    {a.createdByPosition ? ` · ${a.createdByPosition}` : ""}
                  </span>
                  {a.expiresOn && (
                    <span>
                      Expires on: <b>{a.expiresOn}</b>
                    </span>
                  )}
                  {a.imagePath && (
                    <span>
                      Image path: <b>{a.imagePath}</b>
                    </span>
                  )}
                </div>

                {a.imageUrl && (
                  <div style={{ marginTop: 14 }}>
                    <img
                      src={a.imageUrl}
                      alt={a.title || "Announcement image"}
                      onError={(e) => {
                        console.error("Image render failed for:", a.imageUrl);
                        e.currentTarget.style.display = "none";
                      }}
                      style={{
                        width: "100%",
                        maxHeight: 320,
                        objectFit: "cover",
                        borderRadius: 16,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageCard>
    </div>
  );
}
