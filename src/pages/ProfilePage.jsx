// src/pages/ProfilePage.jsx
import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function ProfilePage() {
  const { user, setUser } = useUser();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState("");
  const [pinError, setPinError] = useState("");

  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");

  if (!user) {
    return (
      <div className="p-4">
        <p>You must be logged in to view this page.</p>
      </div>
    );
  }

  const initials = (user.username || "")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinMessage("");
    setPinError("");

    const cur = currentPin.trim();
    const next = newPin.trim();
    const conf = confirmPin.trim();

    if (!cur || !next || !conf) {
      setPinError("Please complete all PIN fields.");
      return;
    }

    if (cur !== user.pin) {
      setPinError("Current PIN is incorrect.");
      return;
    }

    if (next.length !== 4 || !/^\d{4}$/.test(next)) {
      setPinError("New PIN must be exactly 4 digits.");
      return;
    }

    if (next !== conf) {
      setPinError("New PIN and confirm PIN do not match.");
      return;
    }

    if (next === cur) {
      setPinError("New PIN must be different from current PIN.");
      return;
    }

    try {
      setPinLoading(true);
      const refUser = doc(db, "users", user.id);
      await updateDoc(refUser, { pin: next });

      // actualizar contexto
      setUser((prev) => (prev ? { ...prev, pin: next } : prev));

      setPinMessage("PIN updated successfully.");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      console.error("Error updating PIN:", err);
      setPinError("Error updating PIN. Please try again.");
    } finally {
      setPinLoading(false);
    }
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoMessage("");
    setPhotoError("");

    try {
      setPhotoLoading(true);

      const storageRef = ref(storage, `profilePhotos/${user.id}-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const refUser = doc(db, "users", user.id);
      await updateDoc(refUser, { profilePhotoUrl: url });

      setUser((prev) =>
        prev ? { ...prev, profilePhotoUrl: url } : prev
      );

      setPhotoMessage("Profile photo updated successfully.");
    } catch (err) {
      console.error("Error uploading profile photo:", err);
      setPhotoError("Error uploading photo. Please try again.");
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            My Profile
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage your PIN and profile photo.
          </p>
        </div>
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6 space-y-6">
        {/* Info + foto */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              {user.profilePhotoUrl ? (
                <img
                  src={user.profilePhotoUrl}
                  alt="Profile"
                  className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border border-slate-300 shadow-sm"
                />
              ) : (
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-800 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
                  {initials || "U"}
                </div>
              )}
            </div>

            <div>
              <p className="text-lg font-semibold text-slate-900">
                {user.username || user.loginUsername || "User"}
              </p>
              <p className="text-sm text-slate-600">
                Role:{" "}
                <span className="font-medium uppercase">
                  {user.role || "N/A"}
                </span>
              </p>
              {user.employeeId && (
                <p className="text-xs text-slate-500 mt-1">
                  Linked employee ID: {user.employeeId}
                </p>
              )}
            </div>
          </div>

          {/* Upload foto */}
          <div className="md:ml-auto">
            <label className="text-xs font-medium text-slate-700 block mb-1">
              Profile photo
            </label>
            <input
              type="file"
              accept="image/*"
              className="text-xs"
              onChange={handlePhotoChange}
              disabled={photoLoading}
            />
            {photoLoading && (
              <p className="text-[11px] text-slate-500 mt-1">
                Uploading photo…
              </p>
            )}
            {photoError && (
              <p className="text-[11px] text-red-600 mt-1">{photoError}</p>
            )}
            {photoMessage && (
              <p className="text-[11px] text-emerald-600 mt-1">
                {photoMessage}
              </p>
            )}
          </div>
        </div>

        {/* Línea divisoria */}
        <hr className="border-slate-200" />

        {/* Cambiar PIN */}
        <div>
          <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
            Change PIN
          </h2>
          <p className="text-xs md:text-sm text-slate-600 mb-3">
            Your PIN is used to access the TPA OPS Portal and some forms.
          </p>

          <form
            onSubmit={handleChangePin}
            className="grid md:grid-cols-3 gap-3 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Current PIN
              </label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                className="border rounded w-full px-2 py-1 text-sm"
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New PIN (4 digits)
              </label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                className="border rounded w-full px-2 py-1 text-sm"
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Confirm PIN
              </label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                className="border rounded w-full px-2 py-1 text-sm"
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </div>

            {pinError && (
              <div className="md:col-span-3 text-[11px] text-red-600">
                {pinError}
              </div>
            )}
            {pinMessage && (
              <div className="md:col-span-3 text-[11px] text-emerald-600">
                {pinMessage}
              </div>
            )}

            <div className="md:col-span-3 mt-1">
              <button
                type="submit"
                disabled={pinLoading}
                className="btn btn-primary text-xs md:text-sm px-3 py-1.5"
              >
                {pinLoading ? "Saving…" : "Update PIN"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
