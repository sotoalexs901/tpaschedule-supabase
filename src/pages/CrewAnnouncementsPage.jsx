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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SY" },
  { value: "WestJet", label: "WestJet" },
  { value: "WL Invicta", label: "WL Invicta" },
  { value: "AV", label: "AV" },
  { value: "EA", label: "EA" },
  { value: "WCHR", label: "WCHR" },
  { value: "CABIN", label: "Cabin Service" },
  { value: "AA-BSO", label: "AA-BSO" },
  { value: "OTHER", label: "Other" },
];

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

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return airline;
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
    user?.id ||
    "unknown"
  );
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

export default function CrewAnnouncementsPage() {
  const { user } = useUser();

  const [employees, setEmployees] = useState([]);

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementLink, setAnnouncementLink] = useState("");
  const [announcementImageFile, setAnnouncementImageFile] = useState(null);
  const [announcementImageUrl, setAnnouncementImageUrl] = useState("");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventBody, setEventBody] = useState("");
  const [eventLink, setEventLink] = useState("");

  const [spotlightAirline, setSpotlightAirline] = useState("SY");
  const [spotlightDepartment, setSpotlightDepartment] = useState("");
  const [spotlightEmployeeId, setSpotlightEmployeeId] = useState("");
  const [spotlightTitle, setSpotlightTitle] = useState("Employee of the Month");
  const [spotlightBody, setSpotlightBody] = useState("");
  const [spotlightLink, setSpotlightLink] = useState("");
  const [spotlightImageFile, setSpotlightImageFile] = useState(null);
  const [spotlightImageUrl, setSpotlightImageUrl] = useState("");

  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [spotlights, setSpotlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingSpotlight, setSavingSpotlight] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(
    () => user?.position || getDefaultPosition(user?.role),
    [user]
  );

  const filteredEmployees = useMemo(() => {
    const airline = normalizeAirlineName(spotlightAirline);

    return employees.filter((emp) => {
      const empAirline = normalizeAirlineName(
        emp.airline || emp.assignedAirline || emp.baseAirline || ""
      );

      if (!airline) return true;
      if (!empAirline) return true;
      return empAirline === airline;
    });
  }, [employees, spotlightAirline]);

  const selectedEmployee = useMemo(() => {
    return filteredEmployees.find((emp) => emp.id === spotlightEmployeeId) || null;
  }, [filteredEmployees, spotlightEmployeeId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [usersSnap, annSnap, eventSnap, spotlightSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(query(collection(db, "employeeAnnouncements"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "employeeUpcomingEvents"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "employeeSpotlights"), orderBy("createdAt", "desc"))),
      ]);

      setEmployees(
        usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );

      setAnnouncements(annSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEvents(eventSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSpotlights(spotlightSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading editor data:", err);
      setMessage("Error loading dashboard content.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const uploadImageAndGetUrl = async (file, folder) => {
    if (!file) return "";

    if (!file.type.startsWith("image/")) {
      throw new Error("Please select a valid image.");
    }

    const safeName = file.name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
    const storageRef = ref(storage, `${folder}/${Date.now()}_${safeName}`);

    const snap = await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });

    return await getDownloadURL(snap.ref);
  };

  const resolveImage = async (file, url, folder) => {
    const cleanUrl = String(url || "").trim();

    if (cleanUrl) return cleanUrl;
    return await uploadImageAndGetUrl(file, folder);
  };

  const postAnnouncement = async (e) => {
    e.preventDefault();

    if (!announcementTitle.trim() && !announcementBody.trim()) {
      setMessage("Please enter at least a title or message.");
      return;
    }

    try {
      setSavingAnnouncement(true);

      const imageUrl = await resolveImage(
        announcementImageFile,
        announcementImageUrl,
        "employeeAnnouncements"
      );

      await addDoc(collection(db, "employeeAnnouncements"), {
        title: announcementTitle.trim() || "Announcement",
        body: announcementBody.trim() || "",
        link: announcementLink.trim() || "",
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: visibleName,
        createdByUsername: user?.username || "",
        createdByRole: user?.role || "",
        createdByPosition: visiblePosition,
        pinned: false,
        expiresOn: "",
      });

      setAnnouncementTitle("");
      setAnnouncementBody("");
      setAnnouncementLink("");
      setAnnouncementImageFile(null);
      setAnnouncementImageUrl("");
      setMessage("Announcement posted.");
      await loadData();
    } catch (err) {
      console.error("Error posting announcement:", err);
      setMessage(err?.message || "Could not post announcement.");
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const postEvent = async (e) => {
    e.preventDefault();

    if (!eventTitle.trim() || !eventDate) {
      setMessage("Event needs title and date.");
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
        createdBy: visibleName,
      });

      setEventTitle("");
      setEventDate("");
      setEventTime("");
      setEventBody("");
      setEventLink("");
      setMessage("Upcoming event saved.");
      await loadData();
    } catch (err) {
      console.error("Error posting event:", err);
      setMessage(err?.message || "Could not save event.");
    } finally {
      setSavingEvent(false);
    }
  };

  const postSpotlight = async (e) => {
    e.preventDefault();

    if (!spotlightAirline || !spotlightEmployeeId) {
      setMessage("Please select airline and employee.");
      return;
    }

    try {
      setSavingSpotlight(true);

      const imageUrl = await resolveImage(
        spotlightImageFile,
        spotlightImageUrl,
        "employeeSpotlights"
      );

      await addDoc(collection(db, "employeeSpotlights"), {
        title: spotlightTitle.trim() || "Employee of the Month",
        airline: normalizeAirlineName(spotlightAirline),
        department: spotlightDepartment.trim() || "",
        employeeId: spotlightEmployeeId,
        employeeName:
          selectedEmployee?.displayName ||
          selectedEmployee?.fullName ||
          selectedEmployee?.name ||
          selectedEmployee?.username ||
          "Employee",
        employeePosition:
          selectedEmployee?.position ||
          getDefaultPosition(selectedEmployee?.role),
        employeePhotoURL: selectedEmployee?.profilePhotoURL || "",
        imageUrl,
        body: spotlightBody.trim() || "",
        link: spotlightLink.trim() || "",
        active: true,
        createdAt: serverTimestamp(),
        createdBy: visibleName,
      });

      setSpotlightDepartment("");
      setSpotlightEmployeeId("");
      setSpotlightTitle("Employee of the Month");
      setSpotlightBody("");
      setSpotlightLink("");
      setSpotlightImageFile(null);
      setSpotlightImageUrl("");
      setMessage("Employee spotlight saved.");
      await loadData();
    } catch (err) {
      console.error("Error posting spotlight:", err);
      setMessage(err?.message || "Could not save employee spotlight.");
    } finally {
      setSavingSpotlight(false);
    }
  };

  const handleDelete = async (collectionName, id) => {
    const ok = window.confirm("Delete this item?");
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteDoc(doc(db, collectionName, id));
      setMessage("Deleted successfully.");
      await loadData();
    } catch (err) {
      console.error("Error deleting item:", err);
      setMessage("Could not delete item.");
    } finally {
      setDeletingId("");
    }
  };

  const success =
    message.toLowerCase().includes("posted") ||
    message.toLowerCase().includes("saved") ||
    message.toLowerCase().includes("deleted");

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
            TPA OPS · Crew Dashboard Editor
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
          TPA OPS · Crew Dashboard Editor
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
          Manage announcements, upcoming events and employee of the month cards.
        </p>
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
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Post Announcement
        </h2>

        <form
          onSubmit={postAnnouncement}
          style={{ display: "grid", gap: 14 }}
        >
          <div>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="Announcement title"
            />
          </div>

          <div>
            <FieldLabel>Message</FieldLabel>
            <TextArea
              rows={4}
              value={announcementBody}
              onChange={(e) => setAnnouncementBody(e.target.value)}
              placeholder="Write the announcement..."
            />
          </div>

          <div>
            <FieldLabel>Optional Link</FieldLabel>
            <TextInput
              value={announcementLink}
              onChange={(e) => setAnnouncementLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <FieldLabel>Image URL (optional)</FieldLabel>
            <TextInput
              value={announcementImageUrl}
              onChange={(e) => setAnnouncementImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div>
            <FieldLabel>Or Upload Image</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) =>
                setAnnouncementImageFile(e.target.files?.[0] || null)
              }
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
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Upcoming Events
        </h2>

        <form onSubmit={postEvent} style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Event title"
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
            <FieldLabel>Body</FieldLabel>
            <TextArea
              rows={3}
              value={eventBody}
              onChange={(e) => setEventBody(e.target.value)}
              placeholder="Event details"
            />
          </div>

          <div>
            <FieldLabel>Optional Link</FieldLabel>
            <TextInput
              value={eventLink}
              onChange={(e) => setEventLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <ActionButton type="submit" disabled={savingEvent}>
              {savingEvent ? "Saving..." : "Save Event"}
            </ActionButton>
          </div>
        </form>
      </PageCard>

      <PageCard style={{ padding: 22 }}>
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Employee of the Month
        </h2>

        <form onSubmit={postSpotlight} style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Airline</FieldLabel>
              <SelectInput
                value={spotlightAirline}
                onChange={(e) => {
                  setSpotlightAirline(e.target.value);
                  setSpotlightEmployeeId("");
                }}
              >
                {AIRLINE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Department</FieldLabel>
              <TextInput
                value={spotlightDepartment}
                onChange={(e) => setSpotlightDepartment(e.target.value)}
                placeholder="Ramp / TC / Cabin Service / etc"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Employee</FieldLabel>
            <SelectInput
              value={spotlightEmployeeId}
              onChange={(e) => setSpotlightEmployeeId(e.target.value)}
            >
              <option value="">Select employee</option>
              {filteredEmployees.map((emp) => {
                const label =
                  emp.displayName ||
                  emp.fullName ||
                  emp.name ||
                  emp.username ||
                  "Employee";

                return (
                  <option key={emp.id} value={emp.id}>
                    {label}
                  </option>
                );
              })}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Card Title</FieldLabel>
            <TextInput
              value={spotlightTitle}
              onChange={(e) => setSpotlightTitle(e.target.value)}
              placeholder="Employee of the Month"
            />
          </div>

          <div>
            <FieldLabel>Message</FieldLabel>
            <TextArea
              rows={4}
              value={spotlightBody}
              onChange={(e) => setSpotlightBody(e.target.value)}
              placeholder="Why this employee is being recognized..."
            />
          </div>

          <div>
            <FieldLabel>Optional Link</FieldLabel>
            <TextInput
              value={spotlightLink}
              onChange={(e) => setSpotlightLink(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <FieldLabel>Image URL (optional)</FieldLabel>
            <TextInput
              value={spotlightImageUrl}
              onChange={(e) => setSpotlightImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div>
            <FieldLabel>Or Upload Image</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) =>
                setSpotlightImageFile(e.target.files?.[0] || null)
              }
              style={{ padding: "10px 12px" }}
            />
          </div>

          <div>
            <ActionButton type="submit" disabled={savingSpotlight}>
              {savingSpotlight ? "Saving..." : "Add Employee Spotlight"}
            </ActionButton>
          </div>
        </form>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Existing Content
        </h2>

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
            Loading...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <h3 style={{ margin: "0 0 10px", color: "#1769aa" }}>Announcements</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 18,
                      padding: 16,
                      background: "#fff",
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
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>
                          {a.title}
                        </div>
                        {a.body && (
                          <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
                            {a.body}
                          </div>
                        )}
                      </div>

                      <ActionButton
                        variant="danger"
                        onClick={() => handleDelete("employeeAnnouncements", a.id)}
                        disabled={deletingId === a.id}
                      >
                        {deletingId === a.id ? "Deleting..." : "Delete"}
                      </ActionButton>
                    </div>
                  </div>
                ))}
                {announcements.length === 0 && <div>No announcements yet.</div>}
              </div>
            </div>

            <div>
              <h3 style={{ margin: "0 0 10px", color: "#1769aa" }}>Upcoming Events</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {events.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 18,
                      padding: 16,
                      background: "#fff",
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
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>
                          {a.title}
                        </div>
                        <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                          {a.eventDate} {a.eventTime ? `· ${a.eventTime}` : ""}
                        </div>
                      </div>

                      <ActionButton
                        variant="danger"
                        onClick={() => handleDelete("employeeUpcomingEvents", a.id)}
                        disabled={deletingId === a.id}
                      >
                        {deletingId === a.id ? "Deleting..." : "Delete"}
                      </ActionButton>
                    </div>
                  </div>
                ))}
                {events.length === 0 && <div>No upcoming events yet.</div>}
              </div>
            </div>

            <div>
              <h3 style={{ margin: "0 0 10px", color: "#1769aa" }}>
                Employee Spotlights
              </h3>
              <div style={{ display: "grid", gap: 10 }}>
                {spotlights.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 18,
                      padding: 16,
                      background: "#fff",
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
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>
                          {a.employeeName || a.title}
                        </div>
                        <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                          {a.airline || "—"} {a.department ? `· ${a.department}` : ""}
                        </div>
                      </div>

                      <ActionButton
                        variant="danger"
                        onClick={() => handleDelete("employeeSpotlights", a.id)}
                        disabled={deletingId === a.id}
                      >
                        {deletingId === a.id ? "Deleting..." : "Delete"}
                      </ActionButton>
                    </div>
                  </div>
                ))}
                {spotlights.length === 0 && <div>No employee spotlights yet.</div>}
              </div>
            </div>
          </div>
        )}
      </PageCard>
    </div>
  );
}
