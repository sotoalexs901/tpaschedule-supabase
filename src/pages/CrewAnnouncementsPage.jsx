// src/pages/CrewAnnouncementsPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";   // 👈 usamos storage desde firebase.js
import { useUser } from "../UserContext.jsx";

export default function CrewAnnouncementsPage() {
  const { user } = useUser();

  if (!user || user.role !== "station_manager") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Access denied — Only Station Managers can post announcements.
        </h1>
      </div>
    );
  }

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar anuncios existentes
  useEffect(() => {
    async function load() {
      try {
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
    }
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!title && !body) {
      setMessage("Please enter at least a title or a message.");
      return;
    }

    try {
      setSaving(true);

      // 1) Subir imagen (si existe). Si falla, solo mostramos aviso pero seguimos.
      let imageUrl = "";
      if (imageFile) {
        try {
          const safeName = imageFile.name.replace(/\s+/g, "_");
          const storageRef = ref(
            storage,
            `employeeAnnouncements/${Date.now()}_${safeName}`
          );
          const snap = await uploadBytes(storageRef, imageFile);
          imageUrl = await getDownloadURL(snap.ref);
        } catch (uploadErr) {
          console.error("Error uploading image:", uploadErr);
          setMessage(
            "Image upload failed (check storage rules). Posting announcement without image."
          );
          imageUrl = "";
        }
      }

      // 2) Guardar anuncio en Firestore
      await addDoc(collection(db, "employeeAnnouncements"), {
        title: title || "Announcement",
        subtitle: subtitle || "",
        body: body || "",
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: user.username || user.id,
      });

      setTitle("");
      setSubtitle("");
      setBody("");
      setImageFile(null);
      setMessage("Announcement posted!");

      // recargar lista
      const qAnn = query(
        collection(db, "employeeAnnouncements"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qAnn);
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error posting announcement:", err);
      setMessage("Error posting announcement. Check console for details.");
    } finally {
      setSaving(false);
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
    setImageFile(file);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">
        Crew Announcements
      </h1>
      <p className="text-sm text-slate-600">
        Messages created here will appear on the dashboard of Agents and
        Supervisors.
      </p>

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="card p-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Title</label>
          <input
            className="border rounded w-full px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: New parking policy, Holiday party, etc."
          />
        </div>

        <div>
          <label className="text-sm font-medium">Subtitle (optional)</label>
          <input
            className="border rounded w-full px-2 py-1 text-sm"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Short highlight or airline/department"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Message</label>
          <textarea
            className="border rounded w-full px-2 py-1 text-sm min-h-[80px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Details for the crew..."
          />
        </div>

        {/* 📸 IMAGEN OPCIONAL */}
        <div>
          <label className="text-sm font-medium">Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 text-sm"
            onChange={handleImageChange}
          />
          {imageFile && (
            <p className="text-[11px] text-slate-500 mt-1">
              Selected: <b>{imageFile.name}</b>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white w-full py-2 rounded font-semibold text-sm disabled:opacity-70"
        >
          {saving ? "Posting..." : "Post announcement"}
        </button>

        {message && (
          <p className="text-sm text-center mt-2">
            {message.includes("posted") ? (
              <span className="text-green-600">{message}</span>
            ) : (
              <span className="text-red-600">{message}</span>
            )}
          </p>
        )}
      </form>

      {/* LISTA DE ANUNCIOS RECIENTES */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Recent announcements
        </h2>
        {loading && (
          <div className="card p-3 text-sm text-slate-500">
            Loading announcements...
          </div>
        )}
        {!loading && announcements.length === 0 && (
          <div className="card p-3 text-sm text-slate-500">
            No announcements yet.
          </div>
        )}
        {!loading &&
          announcements.map((a) => (
            <div
              key={a.id}
              className="card p-3 space-y-2 text-sm border border-slate-200"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{a.title}</h3>
                {a.createdAt?.toDate && (
                  <span className="text-[10px] text-slate-500">
                    {a.createdAt.toDate().toLocaleDateString()}
                  </span>
                )}
              </div>

              {a.subtitle && (
                <p className="text-xs text-slate-500">{a.subtitle}</p>
              )}

              {a.body && (
                <p className="text-xs text-slate-700 whitespace-pre-line">
                  {a.body}
                </p>
              )}

              {a.imageUrl && (
                <div className="mt-2">
                  <img
                    src={a.imageUrl}
                    alt={a.title || "Announcement image"}
                    className="w-full max-h-60 object-cover rounded-md border border-slate-200"
                  />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
