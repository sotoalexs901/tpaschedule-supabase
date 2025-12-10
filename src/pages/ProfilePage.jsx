// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function ProfilePage() {
  const { user, setUser } = useUser();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [profilePhotoURL, setProfilePhotoURL] = useState("");
  const [photoFile, setPhotoFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Cargar perfil desde Firestore
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        // asumiendo que tu colección de usuarios es "users"
        const userRef = doc(db, "users", user.id);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setUsername(data.username || data.loginUsername || "");
          setPin(data.pin || "");
          setProfilePhotoURL(data.profilePhotoURL || "");
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Error loading your profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user?.id]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación simple de tipo
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (jpg, png, etc).");
      return;
    }

    setPhotoFile(file);
    setError("");

    // Vista previa rápida
    const url = URL.createObjectURL(file);
    setProfilePhotoURL(url);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!user?.id) {
      setError("User not found in session.");
      return;
    }

    if (!username.trim()) {
      setError("Username cannot be empty.");
      return;
    }

    if (pin && pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    try {
      setSaving(true);

      const userRef = doc(db, "users", user.id);

      let finalPhotoURL = profilePhotoURL;

      // 👇 Si hay un archivo nuevo, lo subimos a Storage
      if (photoFile) {
        const storageRef = ref(
          storage,
          `profilePictures/${user.id}/${photoFile.name}`
        );
        await uploadBytes(storageRef, photoFile);
        finalPhotoURL = await getDownloadURL(storageRef);
        setProfilePhotoURL(finalPhotoURL);
      }

      // Actualizar documento en Firestore
      await updateDoc(userRef, {
        username: username.trim(),
        loginUsername: username.trim(),
        pin: pin.trim(),
        profilePhotoURL: finalPhotoURL || "",
      });

      // Actualizar contexto para que el cambio se vea en toda la app
      setUser((prev) =>
        prev
          ? {
              ...prev,
              username: username.trim(),
              loginUsername: username.trim(),
              pin: pin.trim(),
              profilePhotoURL: finalPhotoURL || "",
            }
          : prev
      );

      setMessage("Profile updated successfully.");
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Error saving your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4">
        <p>You must be logged in to view your profile.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold mb-1">My Profile</h1>
      <p className="text-sm text-gray-600">
        Update your display name, PIN, and profile picture.
      </p>

      <form onSubmit={handleSave} className="card space-y-4">
        {/* Foto de perfil */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-500">
            {profilePhotoURL ? (
              <img
                src={profilePhotoURL}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>No photo</span>
            )}
          </div>

          <div className="text-xs text-gray-600 space-y-1">
            <p className="font-medium text-sm">Profile picture</p>
            <input
              type="file"
              accept="image/*"
              className="text-xs"
              onChange={handleFileChange}
            />
            <p className="text-[11px] text-gray-500">
              JPG / PNG. A small square photo works best.
            </p>
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="text-sm font-medium block mb-1">Username</label>
          <input
            className="border rounded w-full px-2 py-1 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your display name"
          />
        </div>

        {/* PIN */}
        <div>
          <label className="text-sm font-medium block mb-1">PIN</label>
          <input
            type="password"
            className="border rounded w-full px-2 py-1 text-sm"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-digit PIN"
            maxLength={10}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            This PIN is used to access certain tools (like time off status).
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
        {message && (
          <p className="text-sm text-green-600 text-center">{message}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white w-full py-2 rounded font-semibold text-sm disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
