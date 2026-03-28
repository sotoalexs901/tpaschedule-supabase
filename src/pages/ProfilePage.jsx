// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
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

function ActionButton({ children, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        borderRadius: 14,
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        border: "none",
        background: disabled
          ? "#94a3b8"
          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
        color: "#fff",
        boxShadow: disabled
          ? "none"
          : "0 12px 24px rgba(23,105,170,0.18)",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

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

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
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

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (jpg, png, etc).");
      return;
    }

    setPhotoFile(file);
    setError("");

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

      if (photoFile) {
        const storageRef = ref(
          storage,
          `profilePictures/${user.id}/${photoFile.name}`
        );
        await uploadBytes(storageRef, photoFile);
        finalPhotoURL = await getDownloadURL(storageRef);
        setProfilePhotoURL(finalPhotoURL);
      }

      await updateDoc(userRef, {
        username: username.trim(),
        loginUsername: username.trim(),
        pin: pin.trim(),
        profilePhotoURL: finalPhotoURL || "",
      });

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
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          You must be logged in to view your profile.
        </p>
      </PageCard>
    );
  }

  if (loading) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading profile...
        </p>
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 900,
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
            TPA OPS · My Profile
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
            My Profile
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Update your display name, PIN and profile picture.
          </p>
        </div>
      </div>

      {error && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#065f46",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 260px) 1fr",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
              alignContent: "start",
            }}
          >
            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 22,
                padding: 18,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 130,
                  height: 130,
                  borderRadius: "999px",
                  overflow: "hidden",
                  background: "#e2e8f0",
                  margin: "0 auto 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {profilePhotoURL ? (
                  <img
                    src={profilePhotoURL}
                    alt="Profile"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span>No photo</span>
                )}
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {username || "User"}
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                {user?.role || "Team Member"}
              </p>
            </div>

            <div>
              <FieldLabel>Profile picture</FieldLabel>
              <TextInput
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ padding: "10px 12px" }}
              />
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                JPG / PNG. A small square photo works best.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSave}
            style={{
              display: "grid",
              gap: 16,
              alignContent: "start",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.02em",
                }}
              >
                Profile Information
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Keep your account details up to date.
              </p>
            </div>

            <div>
              <FieldLabel>Username</FieldLabel>
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            <div>
              <FieldLabel>PIN</FieldLabel>
              <TextInput
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN"
                maxLength={10}
              />
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                This PIN is used to access certain tools and personal features.
              </p>
            </div>

            <div style={{ marginTop: 4 }}>
              <ActionButton type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </ActionButton>
            </div>
          </form>
        </div>
      </PageCard>
    </div>
  );
}
