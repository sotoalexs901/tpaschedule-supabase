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
  const c = String(category || "general").toLowerCase();

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

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!title.trim() && !body.trim()) {
      setMessage("Please enter at least a title or a message.");
      return;
    }

    try {
      setSaving(true);

      let imageUrl = "";
      if (imageFile) {
        try {
          if (!imageFile.type.startsWith("image/")) {
            throw new Error("Please select a valid image file.");
          }

          if (imageFile.size > 5 * 1024 * 1024) {
            throw new Error("Image must be smaller than 5MB.");
          }

          const safeName = imageFile.name
            .replace(/\s+/g, "_")
            .replace(/[^\w.-]/g, "");

          const storageRef = ref(
            storage,
            `employeeAnnouncements/${Date.now()}_${safeName}`
          );

          const snap = await uploadBytes(storageRef, imageFile, {
            contentType: imageFile.type || "image/jpeg",
          });
          imageUrl = await getDownloadURL(snap.ref);
        } catch (uploadErr) {
          console.error("Error uploading image:", uploadErr);
          setMessage(
            uploadErr?.message ||
              "Image upload failed. Announcement was posted without image."
          );
          imageUrl = "";
        }
      }

      await addDoc(collection(db, "employeeAnnouncements"), {
        title: title.trim() || "Announcement",
        subtitle: subtitle.trim() || "",
        body: body.trim() || "",
        category,
        priority,
        pinned,
        expiresOn: expiresOn || "",
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: visibleName,
        createdByUsername: user?.username || "",
        createdByRole: user?.role || "",
        createdByPosition: visiblePosition,
      });

      setTitle("");
      setSubtitle("");
      setBody("");
      setCategory("general");
      setPriority("normal");
      setPinned(false);
      setExpiresOn("");
      setImageFile(null);
      setMessage("Announcement posted!");
      await loadAnnouncements();
    } catch (err) {
      console.error("Error posting announcement:", err);
      setMessage("Error posting announcement. Check console for details.");
    } finally {
      setSaving(false);
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
    if (!file) {
      setImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (jpg, png, etc).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5MB.");
      return;
    }

    setImageFile(file);
  };

  const success =
    message.toLowerCase().includes("posted") ||
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
            TPA OPS · Announcements
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
            Only Station Managers can post and manage crew announcements.
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
            You are not authorized to manage announcements.
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
            TPA OPS · Announcements
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
            Crew Announcements
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Create, publish and manage dashboard announcements for Agents and
            Supervisors.
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
            Post Announcement
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

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: 14,
          }}
        >
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
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ padding: "10px 12px" }}
            />
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
          </div>

          <div>
            <ActionButton type="submit" variant="primary" disabled={saving}>
              {saving ? "Posting..." : "Post announcement"}
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
            Recent Announcements
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Review recent dashboard notices and remove outdated ones.
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
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
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

                  <ActionButton
                    variant="danger"
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    disabled={deletingId === a.id}
                  >
                    {deletingId === a.id ? "Deleting..." : "Delete"}
                  </ActionButton>
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
    </div>
  );
}
