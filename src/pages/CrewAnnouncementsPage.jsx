// src/pages/CrewAnnouncementsPage.jsx
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
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

const EMPLOYEE_MONTH_SLOTS = [1, 2];

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
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
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

function normalizeDepartmentName(name) {
  const value = String(name || "").trim();

  if (!value) return "";

  const upper = value.toUpperCase();

  if (upper === "TC") return "TC";
  if (upper === "RAMP") return "Ramp";
  if (upper === "BSO") return "BSO";
  if (upper === "WCHR") return "WCHR";
  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "Cabin Service";
  }

  return value;
}

function formatDateTime(value) {
  try {
    if (!value) return "—";
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function getStoragePathFromUrl(url) {
  try {
    const match = decodeURIComponent(url).match(/\/o\/([^?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export default function CrewAnnouncementsPage() {
  const { user } = useUser();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [imageFile, setImageFile] = useState(null);

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventBody, setEventBody] = useState("");
  const [eventLink, setEventLink] = useState("");

  const [spotlightSlot, setSpotlightSlot] = useState(1);
  const [spotlightDepartment, setSpotlightDepartment] = useState("");
  const [spotlightEmployeeId, setSpotlightEmployeeId] = useState("");
  const [spotlightTitle, setSpotlightTitle] = useState("");
  const [spotlightBody, setSpotlightBody] = useState("");
  const [spotlightLink, setSpotlightLink] = useState("");
  const [spotlightImageFile, setSpotlightImageFile] = useState(null);

  const [employees, setEmployees] = useState([]);

  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [spotlights, setSpotlights] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingSpotlight, setSavingSpotlight] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(
    () => user?.position || getDefaultPosition(user?.role),
    [user]
  );

  const employeeOptions = useMemo(() => {
    return employees
      .filter((emp) => {
        if (!spotlightDepartment) return true;
        return normalizeDepartmentName(emp.department) === spotlightDepartment;
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [employees, spotlightDepartment]);

  const loadAll = async () => {
    try {
      setLoading(true);

      const [
        announcementsSnap,
        eventsSnap,
        spotlightsSnap,
        employeesSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, "employeeAnnouncements"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "employeeUpcomingEvents"), orderBy("eventDate", "asc"))),
        getDocs(query(collection(db, "employeeSpotlights"), orderBy("slot", "asc"))),
        getDocs(collection(db, "employees")),
      ]);

      setAnnouncements(announcementsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEvents(eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSpotlights(spotlightsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setEmployees(
        employeesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          name:
            d.data().name ||
            d.data().employeeName ||
            d.data().fullName ||
            d.data().displayName ||
            d.data().username ||
            "Unnamed employee",
          department: normalizeDepartmentName(d.data().department || ""),
        }))
      );
    } catch (err) {
      console.error("Error loading crew content:", err);
      setMessage("Error loading content. Check console.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const success =
    message.toLowerCase().includes("posted") ||
    message.toLowerCase().includes("saved") ||
    message.toLowerCase().includes("deleted") ||
    message.toLowerCase().includes("updated");

  const uploadOptionalImage = async (file, folder) => {
    if (!file) return { imageUrl: "", storagePath: "" };

    if (!file.type.startsWith("image/")) {
      throw new Error("Please select a valid image file.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Image must be smaller than 5MB.");
    }

    const safeName = file.name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
    const storagePath = `${folder}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);

    const snap = await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    const imageUrl = await getDownloadURL(snap.ref);

    return { imageUrl, storagePath };
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!title.trim() && !body.trim()) {
      setMessage("Please enter at least a title or a message.");
      return;
    }

    try {
      setSavingAnnouncement(true);

      const { imageUrl, storagePath } = await uploadOptionalImage(
        imageFile,
        "employeeAnnouncements"
      );

      await addDoc(collection(db, "employeeAnnouncements"), {
        title: title.trim() || "Announcement",
        body: body.trim() || "",
        link: link.trim() || "",
        imageUrl,
        storagePath,
        createdAt: serverTimestamp(),
        createdBy: "TPA Eulen Ops",
        createdByUsername: user?.username || "",
        createdByRole: user?.role || "",
        createdByPosition: visiblePosition,
      });

      setTitle("");
      setBody("");
      setLink("");
      setImageFile(null);
      setMessage("Announcement posted!");
      await loadAll();
    } catch (err) {
      console.error("Error posting announcement:", err);
      setMessage(err?.message || "Error posting announcement.");
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handlePostEvent = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!eventTitle.trim() || !eventDate) {
      setMessage("Upcoming event needs title and date.");
      return;
    }

    try {
      setSavingEvent(true);

      await addDoc(collection(db, "employeeUpcomingEvents"), {
        title: eventTitle.trim(),
        eventDate,
        eventTime: eventTime || "",
        body: eventBody.trim() || "",
        link: eventLink.trim() || "",
        createdAt: serverTimestamp(),
        createdBy: "TPA Eulen Ops",
      });

      setEventTitle("");
      setEventDate("");
      setEventTime("");
      setEventBody("");
      setEventLink("");
      setMessage("Upcoming event posted!");
      await loadAll();
    } catch (err) {
      console.error("Error posting event:", err);
      setMessage("Error posting event.");
    } finally {
      setSavingEvent(false);
    }
  };

  const handleSaveSpotlight = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!spotlightDepartment || !spotlightEmployeeId) {
      setMessage("Please select department and employee.");
      return;
    }

    try {
      setSavingSpotlight(true);

      const selectedEmployee = employees.find((emp) => emp.id === spotlightEmployeeId);
      if (!selectedEmployee) {
        setMessage("Selected employee not found.");
        return;
      }

      const existingForSlot = spotlights.find(
        (item) => Number(item.slot) === Number(spotlightSlot)
      );

      let imageUrl = existingForSlot?.imageUrl || "";
      let storagePath = existingForSlot?.storagePath || "";

      if (spotlightImageFile) {
        const uploaded = await uploadOptionalImage(
          spotlightImageFile,
          "employeeSpotlights"
        );
        imageUrl = uploaded.imageUrl;
        storagePath = uploaded.storagePath;
      }

      const payload = {
        slot: Number(spotlightSlot),
        department: spotlightDepartment,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        employeePosition:
          selectedEmployee.position || getDefaultPosition(selectedEmployee.role),
        employeePhotoURL: selectedEmployee.profilePhotoURL || "",
        title: spotlightTitle.trim() || "Employee of the Month",
        body: spotlightBody.trim() || "",
        link: spotlightLink.trim() || "",
        imageUrl,
        storagePath,
        updatedAt: serverTimestamp(),
        updatedBy: "TPA Eulen Ops",
        active: true,
      };

      if (existingForSlot) {
        await updateDoc(doc(db, "employeeSpotlights", existingForSlot.id), payload);
        setMessage("Employee of the Month updated.");
      } else {
        await addDoc(collection(db, "employeeSpotlights"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage("Employee of the Month saved.");
      }

      setSpotlightDepartment("");
      setSpotlightEmployeeId("");
      setSpotlightTitle("");
      setSpotlightBody("");
      setSpotlightLink("");
      setSpotlightImageFile(null);

      await loadAll();
    } catch (err) {
      console.error("Error saving spotlight:", err);
      setMessage(err?.message || "Error saving Employee of the Month.");
    } finally {
      setSavingSpotlight(false);
    }
  };

  const deleteFirestoreItem = async ({ collectionName, id, storagePath, confirmText }) => {
    const ok = window.confirm(confirmText);
    if (!ok) return;

    try {
      setDeletingId(id);

      if (storagePath) {
        try {
          await deleteObject(ref(storage, storagePath));
        } catch (storageErr) {
          console.error("Storage delete warning:", storageErr);
        }
      }

      await deleteDoc(doc(db, collectionName, id));
      setMessage("Item deleted.");
      await loadAll();
    } catch (err) {
      console.error("Error deleting item:", err);
      setMessage("Error deleting item.");
    } finally {
      setDeletingId(null);
    }
  };

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
            TPA OPS · Employee Content
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
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1200,
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
            TPA OPS · Employee Dashboard Content
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
            Crew Dashboard Editor
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Manage employee announcements, upcoming events, links, images and
            two Employee of the Month spotlight cards.
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
            Simple Announcement
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Simple post with title, message, image and optional link.
          </p>
        </div>

        <form onSubmit={handlePostAnnouncement} style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: Holiday parking update"
            />
          </div>

          <div>
            <FieldLabel>Message</FieldLabel>
            <TextArea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Short message for employees..."
            />
          </div>

          <div>
            <FieldLabel>Link (optional)</FieldLabel>
            <TextInput
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <FieldLabel>Image (optional)</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              style={{ padding: "10px 12px" }}
            />
          </div>

          <div>
            <ActionButton type="submit" disabled={savingAnnouncement}>
              {savingAnnouncement ? "Posting..." : "Post Announcement"}
            </ActionButton>
          </div>
        </form>
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
            Upcoming Event
          </h2>
        </div>

        <form onSubmit={handlePostEvent} style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Event Title</FieldLabel>
            <TextInput
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Example: Team meeting"
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
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Time</FieldLabel>
              <TextInput
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Details</FieldLabel>
            <TextArea
              rows={3}
              value={eventBody}
              onChange={(e) => setEventBody(e.target.value)}
              placeholder="Optional details"
            />
          </div>

          <div>
            <FieldLabel>Link (optional)</FieldLabel>
            <TextInput
              value={eventLink}
              onChange={(e) => setEventLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <ActionButton type="submit" disabled={savingEvent}>
              {savingEvent ? "Saving..." : "Post Upcoming Event"}
            </ActionButton>
          </div>
        </form>
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
            Employee of the Month
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Two spotlight cards only. Choose slot 1 or 2, department and employee.
          </p>
        </div>

        <form onSubmit={handleSaveSpotlight} style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Spotlight Slot</FieldLabel>
              <SelectInput
                value={spotlightSlot}
                onChange={(e) => setSpotlightSlot(Number(e.target.value))}
              >
                {EMPLOYEE_MONTH_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    Slot {slot}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Department</FieldLabel>
              <SelectInput
                value={spotlightDepartment}
                onChange={(e) => {
                  setSpotlightDepartment(e.target.value);
                  setSpotlightEmployeeId("");
                }}
              >
                <option value="">Select department</option>
                {["Ramp", "TC", "BSO", "Cabin Service", "WCHR", "Other"].map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Employee</FieldLabel>
              <SelectInput
                value={spotlightEmployeeId}
                onChange={(e) => setSpotlightEmployeeId(e.target.value)}
              >
                <option value="">Select employee</option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>

          <div>
            <FieldLabel>Card Title</FieldLabel>
            <TextInput
              value={spotlightTitle}
              onChange={(e) => setSpotlightTitle(e.target.value)}
              placeholder="Example: Employee of the Month"
            />
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <TextArea
              rows={3}
              value={spotlightBody}
              onChange={(e) => setSpotlightBody(e.target.value)}
              placeholder="Optional recognition text"
            />
          </div>

          <div>
            <FieldLabel>Link (optional)</FieldLabel>
            <TextInput
              value={spotlightLink}
              onChange={(e) => setSpotlightLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <FieldLabel>Custom Image (optional)</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) => setSpotlightImageFile(e.target.files?.[0] || null)}
              style={{ padding: "10px 12px" }}
            />
          </div>

          <div>
            <ActionButton type="submit" disabled={savingSpotlight}>
              {savingSpotlight ? "Saving..." : "Save Employee of the Month"}
            </ActionButton>
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
            Published Announcements
          </h2>
        </div>

        {loading ? (
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
        ) : announcements.length === 0 ? (
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
        ) : (
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

                    {a.link && (
                      <a
                        href={a.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1769aa",
                          textDecoration: "none",
                        }}
                      >
                        Open link
                      </a>
                    )}

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {formatDateTime(a.createdAt)}
                    </div>
                  </div>

                  <ActionButton
                    variant="danger"
                    onClick={() =>
                      deleteFirestoreItem({
                        collectionName: "employeeAnnouncements",
                        id: a.id,
                        storagePath: a.storagePath || getStoragePathFromUrl(a.imageUrl),
                        confirmText: "Delete this announcement?",
                      })
                    }
                    disabled={deletingId === a.id}
                  >
                    {deletingId === a.id ? "Deleting..." : "Delete"}
                  </ActionButton>
                </div>

                {a.imageUrl && (
                  <div style={{ marginTop: 14 }}>
                    <img
                      src={a.imageUrl}
                      alt={a.title || "Announcement image"}
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
            Published Upcoming Events
          </h2>
        </div>

        {loading ? (
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
            Loading events...
          </div>
        ) : events.length === 0 ? (
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
            No upcoming events yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {events.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 20,
                  padding: 18,
                  background: "#ffffff",
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
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {item.title}
                    </h3>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#1769aa",
                        fontWeight: 700,
                      }}
                    >
                      {item.eventDate} {item.eventTime ? `· ${item.eventTime}` : ""}
                    </p>

                    {item.body && (
                      <p
                        style={{
                          margin: "10px 0 0",
                          fontSize: 14,
                          color: "#334155",
                          lineHeight: 1.7,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {item.body}
                      </p>
                    )}

                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1769aa",
                          textDecoration: "none",
                        }}
                      >
                        Open link
                      </a>
                    )}
                  </div>

                  <ActionButton
                    variant="danger"
                    onClick={() =>
                      deleteFirestoreItem({
                        collectionName: "employeeUpcomingEvents",
                        id: item.id,
                        storagePath: "",
                        confirmText: "Delete this upcoming event?",
                      })
                    }
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
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
            Employee of the Month Cards
          </h2>
        </div>

        {loading ? (
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
            Loading spotlight cards...
          </div>
        ) : spotlights.length === 0 ? (
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
            No Employee of the Month cards yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {spotlights.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 20,
                  padding: 18,
                  background: "#ffffff",
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
                        display: "inline-flex",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "#edf7ff",
                        border: "1px solid #cfe7fb",
                        color: "#1769aa",
                        fontSize: 11,
                        fontWeight: 800,
                        marginBottom: 8,
                      }}
                    >
                      Slot {item.slot}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {item.title || "Employee of the Month"}
                    </h3>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 14,
                        color: "#334155",
                        fontWeight: 700,
                      }}
                    >
                      {item.employeeName} · {item.department}
                    </p>

                    {item.employeePosition && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {item.employeePosition}
                      </p>
                    )}

                    {item.body && (
                      <p
                        style={{
                          margin: "10px 0 0",
                          fontSize: 14,
                          color: "#334155",
                          lineHeight: 1.7,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {item.body}
                      </p>
                    )}

                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1769aa",
                          textDecoration: "none",
                        }}
                      >
                        Open link
                      </a>
                    )}
                  </div>

                  <ActionButton
                    variant="danger"
                    onClick={() =>
                      deleteFirestoreItem({
                        collectionName: "employeeSpotlights",
                        id: item.id,
                        storagePath: item.storagePath || getStoragePathFromUrl(item.imageUrl),
                        confirmText: "Delete this Employee of the Month card?",
                      })
                    }
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </ActionButton>
                </div>

                {(item.imageUrl || item.employeePhotoURL) && (
                  <div style={{ marginTop: 14 }}>
                    <img
                      src={item.imageUrl || item.employeePhotoURL}
                      alt={item.employeeName || "Employee spotlight"}
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
