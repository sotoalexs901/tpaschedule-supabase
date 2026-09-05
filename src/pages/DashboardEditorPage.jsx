import React, { useEffect, useMemo, useState } from "react";
import { db, storage } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  deleteDoc,
  orderBy,
  query,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const FIXED_AUTHOR = "AeroStation Hub";

const COLORS = {
  navy: "#073b66",
  blue: "#0f5c91",
  sky: "#2e9fd6",
  lightBlue: "#eaf5ff",
  border: "#dbeafe",
  slate: "#475569",
  muted: "#64748b",
  text: "#0f172a",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  accent = COLORS.blue,
  action,
}) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        padding: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: `${accent}14`,
              border: `1px solid ${accent}26`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.2,
                fontWeight: 800,
                color: COLORS.text,
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h2>

            {subtitle && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: COLORS.muted,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function FieldLabel({ children, optional = false }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        fontSize: 11,
        fontWeight: 800,
        color: COLORS.slate,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
      {optional && (
        <span
          style={{
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 600,
            color: "#94a3b8",
          }}
        >
          optional
        </span>
      )}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: COLORS.text,
        outline: "none",
        transition: "border-color .2s ease, box-shadow .2s ease",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "#93c5fd";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,.10)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "#dbeafe";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 13px",
        fontSize: 14,
        color: COLORS.text,
        outline: "none",
        resize: "vertical",
        minHeight: 96,
        transition: "border-color .2s ease, box-shadow .2s ease",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "#93c5fd";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,.10)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "#dbeafe";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  compact = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        background: disabled
          ? "#94a3b8"
          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 56%, #4aa7dd 100%)",
        color: "#ffffff",
        borderRadius: 12,
        padding: compact ? "9px 13px" : "11px 15px",
        fontWeight: 800,
        fontSize: compact ? 12 : 13,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled
          ? "none"
          : "0 10px 20px rgba(23,105,170,0.16)",
        transition: "transform .18s ease, box-shadow .18s ease",
      }}
    >
      {children}
    </button>
  );
}

function DangerButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1px solid #fecdd3",
        background: disabled ? "#ffe4e6" : "#fff1f2",
        color: "#be123c",
        borderRadius: 11,
        padding: "9px 12px",
        fontWeight: 800,
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryNote({ children }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: COLORS.muted,
      }}
    >
      {children}
    </div>
  );
}

function CountBadge({ value, label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 10px",
        borderRadius: 999,
        border: "1px solid #dbeafe",
        background: "#f8fbff",
        color: COLORS.slate,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <strong style={{ color: COLORS.blue }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        color: COLORS.muted,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function PublishedRow({
  title,
  meta,
  body,
  footer,
  action,
  tone = "blue",
}) {
  const tones = {
    blue: { bg: "#f8fbff", border: "#dbeafe" },
    amber: { bg: "#fffbeb", border: "#fde68a" },
    green: { bg: "#ecfdf5", border: "#d1fae5" },
  };

  const current = tones[tone] || tones.blue;

  return (
    <div
      style={{
        border: `1px solid ${current.border}`,
        background: current.bg,
        borderRadius: 15,
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.3,
            fontWeight: 800,
            color: COLORS.text,
            wordBreak: "break-word",
          }}
        >
          {title}
        </div>

        {meta && (
          <div
            style={{
              marginTop: 5,
              fontSize: 12,
              color: COLORS.slate,
            }}
          >
            {meta}
          </div>
        )}

        {body && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "#334155",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {body}
          </div>
        )}

        {footer && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: COLORS.muted,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {action}
    </div>
  );
}

function RsvpToggle({ checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: 12,
        borderRadius: 14,
        border: checked ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
        background: checked
          ? "linear-gradient(135deg,#eff6ff 0%,#ffffff 100%)"
          : "#f8fafc",
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 850,
            color: "#0f172a",
          }}
        >
          Allow employee RSVP
        </div>

        <div
          style={{
            marginTop: 3,
            fontSize: 11,
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Employees can answer Yes, No, Maybe, or Sorry, I can&apos;t.
        </div>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 20,
          height: 20,
          accentColor: "#1769aa",
          flexShrink: 0,
        }}
      />
    </label>
  );
}

export default function DashboardEditorPage() {
  const { user } = useUser();

  const [message, setMessage] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docTitle, setDocTitle] = useState("");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [eventRsvpEnabled, setEventRsvpEnabled] = useState(true);

  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeLink, setNoticeLink] = useState("");

  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");

  const [savingMessage, setSavingMessage] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingNotice, setSavingNotice] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [loadingContent, setLoadingContent] = useState(true);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [docsList, setDocsList] = useState([]);

  const [deletingId, setDeletingId] = useState("");

  const currentAuthor =
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    FIXED_AUTHOR;

  const contentSummary = useMemo(
    () => ({
      events: events.length,
      notices: notices.length,
      photos: photos.length,
      documents: docsList.length,
    }),
    [events.length, notices.length, photos.length, docsList.length]
  );

  const loadDashboardContent = async () => {
    try {
      setLoadingContent(true);

      const refDoc = doc(db, "dashboard", "main");

      const [mainSnap, eventsSnap, noticesSnap, photosSnap, docsSnap] =
        await Promise.all([
          getDoc(refDoc),
          getDocs(
            query(
              collection(db, "dashboard_events"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "dashboard_notices"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "dashboard_photos"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "dashboard_docs"),
              orderBy("createdAt", "desc")
            )
          ),
        ]);

      if (mainSnap.exists()) {
        setMessage(mainSnap.data().message || "");
      }

      setEvents(eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setNotices(noticesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPhotos(photosSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDocsList(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatus("Could not load dashboard content.");
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    loadDashboardContent();
  }, []);

  const showStatus = (text, type = "info") => {
    setStatus(text);
    setStatusType(type);

    window.clearTimeout(showStatus._timer);
    showStatus._timer = window.setTimeout(() => {
      setStatus("");
    }, 4500);
  };

  const saveMessage = async () => {
    try {
      setSavingMessage(true);

      const refDoc = doc(db, "dashboard", "main");

      await setDoc(
        refDoc,
        {
          message,
          updatedAt: serverTimestamp(),
          updatedBy: currentAuthor,
          updatedByLabel: currentAuthor,
        },
        { merge: true }
      );

      showStatus("Dashboard message saved.", "success");
    } catch (err) {
      console.error("Save message error:", err);
      showStatus(
        err?.message || "Could not save dashboard message.",
        "error"
      );
    } finally {
      setSavingMessage(false);
    }
  };

  const addEvent = async () => {
    if (!eventTitle.trim() || !eventDate) {
      showStatus("Event needs a title and date.", "error");
      return;
    }

    try {
      setSavingEvent(true);

      await addDoc(collection(db, "dashboard_events"), {
        title: eventTitle.trim(),
        date: eventDate,
        time: eventTime || null,
        details: eventDetails.trim() || null,

        rsvpEnabled: eventRsvpEnabled,
        rsvpVersion: 1,
        rsvpOptions: ["yes", "no", "maybe", "cant"],

        createdAt: serverTimestamp(),
        createdBy: currentAuthor,
        createdByLabel: currentAuthor,
      });

      setEventTitle("");
      setEventDate("");
      setEventTime("");
      setEventDetails("");
      setEventRsvpEnabled(true);

      await loadDashboardContent();

      showStatus(
        eventRsvpEnabled
          ? "Event published with employee RSVP enabled."
          : "Event published.",
        "success"
      );
    } catch (err) {
      console.error("Add event error:", err);
      showStatus(err?.message || "Could not add event.", "error");
    } finally {
      setSavingEvent(false);
    }
  };

  const addNotice = async () => {
    if (!noticeTitle.trim()) {
      showStatus("Notice needs a title.", "error");
      return;
    }

    try {
      setSavingNotice(true);

      await addDoc(collection(db, "dashboard_notices"), {
        title: noticeTitle.trim(),
        body: noticeBody.trim() || null,
        link: noticeLink.trim() || null,
        createdAt: serverTimestamp(),
        createdBy: currentAuthor,
        createdByLabel: currentAuthor,
      });

      setNoticeTitle("");
      setNoticeBody("");
      setNoticeLink("");

      await loadDashboardContent();

      showStatus("Notice published.", "success");
    } catch (err) {
      console.error("Add notice error:", err);
      showStatus(err?.message || "Could not add notice.", "error");
    } finally {
      setSavingNotice(false);
    }
  };

  const uploadPhoto = async () => {
    if (!photoFile) {
      showStatus("Select a photo first.", "error");
      return;
    }

    try {
      setUploadingPhoto(true);
      showStatus("Uploading photo...", "info");

      const path = `dashboard_photos/${Date.now()}_${photoFile.name}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, photoFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "dashboard_photos"), {
        url,
        caption: "",
        title: "",
        filename: photoFile.name,
        storagePath: path,
        createdAt: serverTimestamp(),
        createdBy: currentAuthor,
        createdByLabel: currentAuthor,
      });

      setPhotoFile(null);

      const photoInput = document.getElementById("dashboard-photo-input");
      if (photoInput) photoInput.value = "";

      await loadDashboardContent();

      showStatus("Photo uploaded successfully.", "success");
    } catch (err) {
      console.error("Photo upload error:", err);

      showStatus(
        err?.message ||
          "Error uploading photo. Check Firebase Storage rules.",
        "error"
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const uploadDoc = async () => {
    if (!docFile || !docTitle.trim()) {
      showStatus("Select a document and enter a title.", "error");
      return;
    }

    try {
      setUploadingDoc(true);
      showStatus("Uploading document...", "info");

      const path = `dashboard_docs/${Date.now()}_${docFile.name}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, docFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "dashboard_docs"), {
        url,
        title: docTitle.trim(),
        filename: docFile.name,
        storagePath: path,
        createdAt: serverTimestamp(),
        createdBy: currentAuthor,
        createdByLabel: currentAuthor,
      });

      setDocFile(null);
      setDocTitle("");

      const docInput = document.getElementById("dashboard-doc-input");
      if (docInput) docInput.value = "";

      await loadDashboardContent();

      showStatus("Document uploaded successfully.", "success");
    } catch (err) {
      console.error("Document upload error:", err);

      showStatus(
        err?.message ||
          "Error uploading document. Check Firebase Storage rules.",
        "error"
      );
    } finally {
      setUploadingDoc(false);
    }
  };

  const deleteDashboardItem = async ({
    collectionName,
    id,
    label,
    storagePath,
  }) => {
    const ok = window.confirm(`Delete this ${label}?`);
    if (!ok) return;

    try {
      setDeletingId(id);

      if (collectionName === "dashboard_events") {
        const responsesSnap = await getDocs(
          collection(db, "dashboard_events", id, "responses")
        );

        if (!responsesSnap.empty) {
          await Promise.all(
            responsesSnap.docs.map((responseDoc) =>
              deleteDoc(responseDoc.ref)
            )
          );
        }
      }

      await deleteDoc(doc(db, collectionName, id));

      if (storagePath) {
        try {
          await deleteObject(ref(storage, storagePath));
        } catch (storageErr) {
          console.error("Storage delete warning:", storageErr);
        }
      }

      await loadDashboardContent();

      showStatus(`${label} deleted successfully.`, "success");
    } catch (err) {
      console.error(`Delete ${label} error:`, err);
      showStatus(err?.message || `Could not delete ${label}.`, "error");
    } finally {
      setDeletingId("");
    }
  };

  const statusBg =
    statusType === "success"
      ? "#ecfdf5"
      : statusType === "error"
      ? "#fff1f2"
      : "#eff6ff";

  const statusBorder =
    statusType === "success"
      ? "#a7f3d0"
      : statusType === "error"
      ? "#fecdd3"
      : "#bfdbfe";

  const statusColor =
    statusType === "success"
      ? "#065f46"
      : statusType === "error"
      ? "#9f1239"
      : "#1d4ed8";

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
            "linear-gradient(135deg, #073b66 0%, #0f5c91 52%, #2e9fd6 100%)",
          borderRadius: 18,
          padding: "14px 16px",
          color: "#ffffff",
          boxShadow: "0 14px 30px rgba(15,76,129,0.16)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 150,
            height: 150,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            top: -92,
            right: -28,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                flex: "0 0 42px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.9)",
                overflow: "hidden",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 8.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 800,
                  marginBottom: 2,
                }}
              >
                {APP_NAME} {"\u00B7"} Content Administration
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                Dashboard Editor
              </h1>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Publish and maintain content displayed across the station dashboard.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <CountBadge value={contentSummary.events} label="Events" />
            <CountBadge value={contentSummary.notices} label="Notices" />
            <CountBadge value={contentSummary.photos} label="Photos" />
            <CountBadge value={contentSummary.documents} label="Docs" />
          </div>
        </div>
      </div>

      {status && (
        <div
          role="status"
          style={{
            background: statusBg,
            border: `1px solid ${statusBorder}`,
            borderRadius: 14,
            padding: "12px 14px",
            color: statusColor,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {status}
        </div>
      )}

      <SectionCard
        title="Station Manager Message"
        subtitle="Controls the primary message shown on the dashboard."
        icon={"\u{1F4E2}"}
        accent="#1f7cc1"
        action={
          <div
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              fontSize: 10.5,
              color: COLORS.muted,
              fontWeight: 700,
            }}
          >
            Author: {currentAuthor}
          </div>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Main message</FieldLabel>
            <TextArea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the main message for the station team..."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={saveMessage} disabled={savingMessage}>
              {savingMessage ? "Saving..." : "Save Message"}
            </PrimaryButton>
          </div>
        </div>
      </SectionCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        <SectionCard
          title="Create Event"
          subtitle="Post a dated operational event to the dashboard."
          icon={"\u{1F4C5}"}
          accent="#1f7cc1"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput
                placeholder="Event title"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
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
                <FieldLabel optional>Time</FieldLabel>
                <TextInput
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                />
              </div>
            </div>

            <div>
              <FieldLabel optional>Details</FieldLabel>
              <TextArea
                rows={3}
                placeholder="Operational details, location or instructions"
                value={eventDetails}
                onChange={(e) => setEventDetails(e.target.value)}
              />
            </div>

            <RsvpToggle
              checked={eventRsvpEnabled}
              onChange={setEventRsvpEnabled}
            />

            {eventRsvpEnabled && (
              <SecondaryNote>
                Employee responses will be stored under this event as:
                {" "}
                <b>Yes</b>, <b>No</b>, <b>Maybe</b>, and <b>Sorry, I can&apos;t</b>.
                Management response counts and employee names will be added to the
                Station Manager Dashboard in the next step.
              </SecondaryNote>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={addEvent} disabled={savingEvent}>
                {savingEvent ? "Publishing..." : "Publish Event"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Create Notice"
          subtitle="Publish a quick update, announcement or invitation."
          icon={"\u{1F4CC}"}
          accent={COLORS.warning}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput
                placeholder="Notice title"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel optional>Message</FieldLabel>
              <TextArea
                rows={3}
                placeholder="Notice details"
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel optional>Link</FieldLabel>
              <TextInput
                placeholder="https://..."
                value={noticeLink}
                onChange={(e) => setNoticeLink(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={addNotice} disabled={savingNotice}>
                {savingNotice ? "Publishing..." : "Publish Notice"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        <SectionCard
          title="Upload Photo"
          subtitle="Add a station highlight image to the dashboard gallery."
          icon={"\u{1F5BC}"}
          accent="#5aa9e6"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <FieldLabel>Select image</FieldLabel>
              <TextInput
                id="dashboard-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                style={{ padding: "9px 11px" }}
              />
            </div>

            {photoFile && (
              <SecondaryNote>
                Selected: <b>{photoFile.name}</b>
              </SecondaryNote>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={uploadPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Upload Document"
          subtitle="Publish SOPs, memos, checklists or other operational references."
          icon={"\u{1F4C4}"}
          accent={COLORS.success}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <FieldLabel>Select document</FieldLabel>
              <TextInput
                id="dashboard-doc-input"
                type="file"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                style={{ padding: "9px 11px" }}
              />
            </div>

            {docFile && (
              <SecondaryNote>
                Selected: <b>{docFile.name}</b>
              </SecondaryNote>
            )}

            <div>
              <FieldLabel>Document title</FieldLabel>
              <TextInput
                placeholder="SOP, memo, checklist..."
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={uploadDoc} disabled={uploadingDoc}>
                {uploadingDoc ? "Uploading..." : "Upload Document"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Published Events"
        subtitle="Review or remove events currently stored in the dashboard."
        icon={"\u{1F5C2}"}
        accent={COLORS.blue}
        action={<CountBadge value={events.length} label="Published" />}
      >
        {loadingContent ? (
          <EmptyState text="Loading events..." />
        ) : events.length === 0 ? (
          <EmptyState text="No events published." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {events.map((item) => (
              <PublishedRow
                key={item.id}
                title={item.title || "Untitled"}
                meta={
                  <>
                    {item.date || "\u2014"}{" "}
                    {item.time ? `\u00B7 ${item.time}` : ""}
                    {" "}
                    {item.rsvpEnabled ? "\u00B7 RSVP Enabled" : ""}
                  </>
                }
                body={item.details || null}
                footer={`By ${
                  item.createdByLabel ||
                  item.createdBy ||
                  FIXED_AUTHOR
                }`}
                action={
                  <DangerButton
                    disabled={deletingId === item.id}
                    onClick={() =>
                      deleteDashboardItem({
                        collectionName: "dashboard_events",
                        id: item.id,
                        label: "event",
                      })
                    }
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </DangerButton>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Published Notices"
        subtitle="Review or remove active notices and invitations."
        icon={"\u{1F4EC}"}
        accent={COLORS.warning}
        action={<CountBadge value={notices.length} label="Published" />}
      >
        {loadingContent ? (
          <EmptyState text="Loading notices..." />
        ) : notices.length === 0 ? (
          <EmptyState text="No notices published." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {notices.map((item) => (
              <PublishedRow
                key={item.id}
                tone="amber"
                title={item.title || "Untitled"}
                body={
                  <>
                    {item.body || null}
                    {item.link && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: COLORS.blue,
                            fontWeight: 800,
                            fontSize: 12,
                            textDecoration: "none",
                          }}
                        >
                          Open link {"\u2192"}
                        </a>
                      </div>
                    )}
                  </>
                }
                footer={`By ${
                  item.createdByLabel ||
                  item.createdBy ||
                  FIXED_AUTHOR
                }`}
                action={
                  <DangerButton
                    disabled={deletingId === item.id}
                    onClick={() =>
                      deleteDashboardItem({
                        collectionName: "dashboard_notices",
                        id: item.id,
                        label: "notice",
                      })
                    }
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </DangerButton>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Published Photos"
        subtitle="Review or remove station highlight images."
        icon={"\u{1F4F7}"}
        accent="#5aa9e6"
        action={<CountBadge value={photos.length} label="Published" />}
      >
        {loadingContent ? (
          <EmptyState text="Loading photos..." />
        ) : photos.length === 0 ? (
          <EmptyState text="No photos published." />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {photos.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  borderRadius: 16,
                  padding: 10,
                  display: "grid",
                  gap: 9,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 10",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#e2e8f0",
                  }}
                >
                  <img
                    src={item.url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: 10.5,
                    color: COLORS.muted,
                  }}
                >
                  By {item.createdByLabel || item.createdBy || FIXED_AUTHOR}
                </div>

                <DangerButton
                  disabled={deletingId === item.id}
                  onClick={() =>
                    deleteDashboardItem({
                      collectionName: "dashboard_photos",
                      id: item.id,
                      label: "photo",
                      storagePath: item.storagePath,
                    })
                  }
                >
                  {deletingId === item.id ? "Deleting..." : "Delete"}
                </DangerButton>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Published Documents"
        subtitle="Review or remove operational reference documents."
        icon={"\u{1F5C3}"}
        accent={COLORS.success}
        action={<CountBadge value={docsList.length} label="Published" />}
      >
        {loadingContent ? (
          <EmptyState text="Loading documents..." />
        ) : docsList.length === 0 ? (
          <EmptyState text="No documents published." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {docsList.map((item) => (
              <PublishedRow
                key={item.id}
                tone="green"
                title={item.title || item.filename || "Untitled document"}
                meta={item.filename ? `File: ${item.filename}` : null}
                body={
                  item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: COLORS.blue,
                        fontWeight: 800,
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      Open document {"\u2192"}
                    </a>
                  ) : null
                }
                footer={`By ${
                  item.createdByLabel ||
                  item.createdBy ||
                  FIXED_AUTHOR
                }`}
                action={
                  <DangerButton
                    disabled={deletingId === item.id}
                    onClick={() =>
                      deleteDashboardItem({
                        collectionName: "dashboard_docs",
                        id: item.id,
                        label: "document",
                        storagePath: item.storagePath,
                      })
                    }
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </DangerButton>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
