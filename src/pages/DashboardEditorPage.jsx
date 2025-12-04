// src/pages/DashboardEditorPage.jsx
import React, { useEffect, useState } from "react";
import { db, storage } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useUser } from "../UserContext.jsx";

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

  // Cargar mensaje principal
  useEffect(() => {
    async function load() {
      const refDoc = doc(db, "dashboard", "main");
      const snap = await getDoc(refDoc);
      if (snap.exists()) setMessage(snap.data().message || "");
    }
    load().catch(console.error);
  }, []);

  const saveMessage = async () => {
    const refDoc = doc(db, "dashboard", "main");
    await setDoc(refDoc, {
      message,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.username || "station_manager",
    });
    setStatus("Dashboard message saved.");
  };

  // EVENTOS
  const addEvent = async () => {
    if (!eventTitle || !eventDate) {
      setStatus("Event needs title and date.");
      return;
    }
    await addDoc(collection(db, "dashboard_events"), {
      title: eventTitle,
      date: eventDate,
      time: eventTime || null,
      details: eventDetails || null,
      createdAt: serverTimestamp(),
      createdBy: user?.username || "station_manager",
    });
    setEventTitle("");
    setEventDate("");
    setEventTime("");
    setEventDetails("");
    setStatus("Event added.");
  };

  // NOTICES
  const addNotice = async () => {
    if (!noticeTitle) {
      setStatus("Notice needs a title.");
      return;
    }
    await addDoc(collection(db, "dashboard_notices"), {
      title: noticeTitle,
      body: noticeBody || null,
      link: noticeLink || null,
      createdAt: serverTimestamp(),
      createdBy: user?.username || "station_manager",
    });
    setNoticeTitle("");
    setNoticeBody("");
    setNoticeLink("");
    setStatus("Notice added.");
  };

  // 📷 SUBIR FOTO REAL A FIREBASE STORAGE
  const uploadPhoto = async () => {
    if (!photoFile) {
      setStatus("Select a photo first.");
      return;
    }

    try {
      setStatus("Uploading photo...");
      const path = `dashboard_photos/${Date.now()}_${photoFile.name}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, photoFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "dashboard_photos"), {
        url,
        caption: photoFile.name,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
      });

      setPhotoFile(null);
      setStatus("Photo uploaded successfully.");
    } catch (err) {
      console.error("Photo upload error:", err);
      setStatus("Error uploading photo.");
    }
  };

  // 📄 SUBIR DOCUMENTO REAL A STORAGE
  const uploadDoc = async () => {
    if (!docFile || !docTitle) {
      setStatus("Select a document and enter a title.");
      return;
    }

    try {
      setStatus("Uploading document...");
      const path = `dashboard_docs/${Date.now()}_${docFile.name}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, docFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "dashboard_docs"), {
        url,
        title: docTitle,
        filename: docFile.name,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
      });

      setDocFile(null);
      setDocTitle("");
      setStatus("Document uploaded successfully.");
    } catch (err) {
      console.error("Document upload error:", err);
      setStatus("Error uploading document.");
    }
  };

  return (
    <div className="space-y-4">
      {/* MENSAJE PRINCIPAL */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Dashboard Message</h2>
        <textarea
          className="border rounded w-full text-sm p-2"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="btn btn-primary text-xs" onClick={saveMessage}>
          Save Message
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* EVENTOS */}
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Add Event</h3>
          <input
            className="border rounded w-full text-xs px-2 py-1"
            placeholder="Title"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
          />
          <input
            className="border rounded w-full text-xs px-2 py-1"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <input
            className="border rounded w-full text-xs px-2 py-1"
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
          />
          <textarea
            className="border rounded w-full text-xs px-2 py-1"
            rows={2}
            placeholder="Details"
            value={eventDetails}
            onChange={(e) => setEventDetails(e.target.value)}
          />
          <button className="btn btn-primary text-xs" onClick={addEvent}>
            Add Event
          </button>
        </div>

        {/* NOTICES */}
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">
            Add Notice / Invitation
          </h3>
          <input
            className="border rounded w-full text-xs px-2 py-1"
            placeholder="Title"
            value={noticeTitle}
            onChange={(e) => setNoticeTitle(e.target.value)}
          />
          <textarea
            className="border rounded w-full text-xs px-2 py-1"
            rows={2}
            placeholder="Body"
            value={noticeBody}
            onChange={(e) => setNoticeBody(e.target.value)}
          />
          <input
            className="border rounded w-full text-xs px-2 py-1"
            placeholder="Optional link"
            value={noticeLink}
            onChange={(e) => setNoticeLink(e.target.value)}
          />
          <button className="btn btn-primary text-xs" onClick={addNotice}>
            Add Notice
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* FOTO REAL */}
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Add Photo</h3>
          <input
            className="text-xs"
            type="file"
            accept="image/*"
            onChange={(e) =>
              setPhotoFile(e.target.files?.[0] || null)
            }
          />
          <button className="btn text-xs" onClick={uploadPhoto}>
            Upload Photo
          </button>
          <p className="text-[10px] text-gray-500">
            This will upload the image to Firebase Storage and make it
            available for the dashboard.
          </p>
        </div>

        {/* DOCUMENTO REAL */}
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">
            Add Document
          </h3>
          <input
            className="text-xs"
            type="file"
            onChange={(e) =>
              setDocFile(e.target.files?.[0] || null)
            }
          />
          <input
            className="border rounded w-full text-xs px-2 py-1"
            placeholder="Document title"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
          />
          <button className="btn text-xs" onClick={uploadDoc}>
            Upload Document
          </button>
          <p className="text-[10px] text-gray-500">
            Upload SOPs, memos or other docs for your team.
          </p>
        </div>
      </div>

      {status && (
        <p className="text-[11px] text-gray-600" role="status">
          {status}
        </p>
      )}
    </div>
  );
}


