import React, { useEffect, useState } from "react";
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
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useUser } from "../UserContext.jsx";

const FIXED_AUTHOR = "TPA Eulen Ops";

function SectionCard({ title, subtitle, icon, children, accent = "#1769aa" }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        padding: 20,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: `${accent}16`,
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
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

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

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 16,
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

function PrimaryButton({ children, onClick, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        background: disabled
          ? "#94a3b8"
          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
        color: "#fff",
        borderRadius: 14,
        padding: "12px 16px",
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 12px 24px rgba(23,105,170,0.18)",
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
        color: "#b91c1c",
        borderRadius: 12,
        padding: "10px 14px",
        fontWeight: 800,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryNote({ children }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.5,
        color: "#64748b",
      }}
    >
      {children}
    </p>
  );
}

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
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

  const loadDashboardContent = async () => {
    try {
      setLoadingContent(true);

      const refDoc = doc(db, "dashboard", "main");
      const [mainSnap, eventsSnap, noticesSnap, photosSnap, docsSnap] =
        await Promise.all([
          getDoc(refDoc),
          getDocs(query(collection(db, "dashboard_events"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "dashboard_notices"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "dashboard_photos"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "dashboard_docs"), orderBy("createdAt", "desc"))),
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
          updatedBy: FIXED_AUTHOR,
          updatedByLabel: FIXED_AUTHOR,
        },
        { merge: true }
      );
      showStatus("Dashboard message saved.", "success");
    } catch (err) {
      console.error("Save message error:", err);
      showStatus(err?.message || "Could not save dashboard message.", "error");
    } finally {
      setSavingMessage(false);
    }
  };

  const addEvent = async () => {
    if (!eventTitle || !eventDate) {
      showStatus("Event needs title and date.", "error");
      return;
    }

    try {
      setSavingEvent(true);
      await addDoc(collection(db, "dashboard_events"), {
        title: eventTitle,
        date: eventDate,
        time: eventTime || null,
        details: eventDetails || null,
        createdAt: serverTimestamp(),
        createdBy: FIXED_AUTHOR,
        createdByLabel: FIXED_AUTHOR,
      });

      setEventTitle("");
      setEventDate("");
      setEventTime("");
      setEventDetails("");
      await loadDashboardContent();
      showStatus("Event added.", "success");
    } catch (err) {
      console.error("Add event error:", err);
      showStatus(err?.message || "Could not add event.", "error");
    } finally {
      setSavingEvent(false);
    }
  };

  const addNotice = async () => {
    if (!noticeTitle) {
      showStatus("Notice needs a title.", "error");
      return;
    }

    try {
      setSavingNotice(true);
      await addDoc(collection(db, "dashboard_notices"), {
        title: noticeTitle,
        body: noticeBody || null,
        link: noticeLink || null,
        createdAt: serverTimestamp(),
        createdBy: FIXED_AUTHOR,
        createdByLabel: FIXED_AUTHOR,
      });

      setNoticeTitle("");
      setNoticeBody("");
      setNoticeLink("");
      await loadDashboardContent();
      showStatus("Notice added.", "success");
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
        createdBy: FIXED_AUTHOR,
        createdByLabel: FIXED_AUTHOR,
      });

      setPhotoFile(null);
      const photoInput = document.getElementById("dashboard-photo-input");
      if (photoInput) photoInput.value = "";

      await loadDashboardContent();
      showStatus("Photo uploaded successfully.", "success");
    } catch (err) {
      console.error("Photo upload error:", err);
      showStatus(
        err?.message || "Error uploading photo. Check Firebase Storage rules.",
        "error"
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const uploadDoc = async () => {
    if (!docFile || !docTitle) {
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
        title: docTitle,
        filename: docFile.name,
        storagePath: path,
        createdAt: serverTimestamp(),
        createdBy: FIXED_AUTHOR,
        createdByLabel: FIXED_AUTHOR,
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
        err?.message || "Error uploading document. Check Firebase Storage rules.",
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
            Manage dashboard content
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.86)",
            }}
          >
            Update the main station message, create events and notices, upload
            dashboard photos and operational documents, and remove published items
            without opening Firebase.
          </p>
        </div>
      </div>

      {status && (
        <div
          role="status"
          style={{
            background: statusBg,
            border: `1px solid ${statusBorder}`,
            borderRadius: 18,
            padding: "14px 16px",
            color: statusColor,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {status}
        </div>
      )}

      <SectionCard
        title="Dashboard Message"
        subtitle="This appears in the main dashboard welcome area."
        icon="📢"
        accent="#1f7cc1"
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Main message</FieldLabel>
            <TextArea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the main message for the station team..."
            />
          </div>

          <SecondaryNote>
            Author will be saved as <b>{FIXED_AUTHOR}</b>.
          </SecondaryNote>

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
          title="Add Event"
          subtitle="Create upcoming operational events."
          icon="📅"
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
                placeholder="Optional event details"
                value={eventDetails}
                onChange={(e) => setEventDetails(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={addEvent} disabled={savingEvent}>
                {savingEvent ? "Adding..." : "Add Event"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Add Notice / Invitation"
          subtitle="Create quick updates or invitation cards."
          icon="📌"
          accent="#f59e0b"
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
              <FieldLabel>Body</FieldLabel>
              <TextArea
                rows={3}
                placeholder="Optional body"
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Optional link</FieldLabel>
              <TextInput
                placeholder="https://..."
                value={noticeLink}
                onChange={(e) => setNoticeLink(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={addNotice} disabled={savingNotice}>
                {savingNotice ? "Adding..." : "Add Notice"}
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
          title="Add Photo"
          subtitle="Upload a highlight image for the dashboard gallery."
          icon="🖼️"
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
                style={{ padding: "10px 12px" }}
              />
            </div>

            {photoFile && (
              <div
                style={{
                  background: "#f8fbff",
                  border: "1px solid #d7e9fb",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Selected file: {photoFile.name}
              </div>
            )}

            <SecondaryNote>
              Photos are uploaded without visible caption text.
            </SecondaryNote>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={uploadPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Add Document"
          subtitle="Upload SOPs, memos or operational reference files."
          icon="📄"
          accent="#10b981"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <FieldLabel>Select document</FieldLabel>
              <TextInput
                id="dashboard-doc-input"
                type="file"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                style={{ padding: "10px 12px" }}
              />
            </div>

            {docFile && (
              <div
                style={{
                  background: "#f8fbff",
                  border: "1px solid #d7e9fb",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Selected file: {docFile.name}
              </div>
            )}

            <div>
              <FieldLabel>Document title</FieldLabel>
              <TextInput
                placeholder="SOP, memo, checklist..."
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />
            </div>

            <SecondaryNote>
              This uploads the file and saves it with author <b>{FIXED_AUTHOR}</b>.
            </SecondaryNote>

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
        subtitle="Review and delete events already posted."
        icon="🗂️"
        accent="#1769aa"
      >
        {loadingContent ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            No events published.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {events.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  borderRadius: 16,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                    {item.title || "Untitled"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                    {item.date || "—"} {item.time ? `· ${item.time}` : ""}
                  </div>
                  {item.details && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: "#334155",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.details}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                    By {FIXED_AUTHOR}
                  </div>
                </div>

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
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Published Notices"
        subtitle="Review and delete notices already posted."
        icon="📬"
        accent="#f59e0b"
      >
        {loadingContent ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            Loading notices...
          </div>
        ) : notices.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            No notices published.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {notices.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #fde68a",
                  background: "#fffbeb",
                  borderRadius: 16,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                    {item.title || "Untitled"}
                  </div>
                  {item.body && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: "#334155",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.body}
                    </div>
                  )}
                  {item.link && (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#1769aa", fontWeight: 700 }}
                      >
                        Open link
                      </a>
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                    By {FIXED_AUTHOR}
                  </div>
                </div>

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
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Published Photos"
        subtitle="Review and delete photos already uploaded."
        icon="📷"
        accent="#5aa9e6"
      >
        {loadingContent ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            Loading photos...
          </div>
        ) : photos.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            No photos published.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            {photos.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  borderRadius: 18,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 10",
                    borderRadius: 14,
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

                <div style={{ fontSize: 12, color: "#64748b" }}>
                  By {FIXED_AUTHOR}
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
        subtitle="Review and delete uploaded documents."
        icon="🗃️"
        accent="#10b981"
      >
        {loadingContent ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            Loading documents...
          </div>
        ) : docsList.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            No documents published.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {docsList.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #d1fae5",
                  background: "#ecfdf5",
                  borderRadius: 16,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                    {item.title || item.filename || "Untitled document"}
                  </div>
                  {item.filename && (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
                      File: {item.filename}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                    By {FIXED_AUTHOR}
                  </div>
                  {item.url && (
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#1769aa", fontWeight: 700, fontSize: 13 }}
                      >
                        Open document
                      </a>
                    </div>
                  )}
                </div>

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
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
