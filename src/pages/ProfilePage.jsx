import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  deleteField,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const PushNotificationsButton = lazy(() =>
  import("../components/PushNotificationsButton.jsx")
);

// IMPORTANT:
// Special punctuation and symbols use Unicode escape sequences where practical
// to reduce encoding issues when editing through GitHub/Safari/iPad.

function useIsMobile(breakpoint = 780) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function PageCard({ children, style = {}, isMobile = false }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(219,234,254,0.88)",
        borderRadius: isMobile ? 18 : 24,
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
        fontSize: 11,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.05em",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        minHeight: 46,
        fontSize: 16,
        color: "#0f172a",
        outline: "none",
        WebkitAppearance: "none",
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
        padding: "13px 16px",
        minHeight: 48,
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

function safeFileName(name = "photo") {
  return String(name)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getRoleLabel(role) {
  return getDefaultPosition(role);
}

function formatBirthdayPreview(month, day) {
  const safeMonth = Number(month || 0);
  const safeDay = Number(day || 0);

  if (!safeMonth || !safeDay) return "Not set";

  const date = new Date(2000, safeMonth - 1, safeDay);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function parseLegacyBirthday(value) {
  if (!value) return { month: "", day: "" };

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      month: String(Number(value.slice(5, 7))),
      day: String(Number(value.slice(8, 10))),
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { month: "", day: "" };

  return {
    month: String(parsed.getMonth() + 1),
    day: String(parsed.getDate()),
  };
}

const BIRTHDAY_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInBirthdayMonth(month) {
  const safeMonth = Number(month || 0);
  if (!safeMonth) return 31;
  return new Date(2000, safeMonth, 0).getDate();
}

async function findLinkedEmployeeDocs({ userId, username }) {
  const found = new Map();

  const collect = (snap) => {
    snap.docs.forEach((d) => {
      found.set(d.ref.path, d.ref);
    });
  };

  try {
    if (userId) {
      const byUserId = await getDocs(
        query(collection(db, "employees"), where("userId", "==", userId))
      );
      collect(byUserId);
    }
  } catch (err) {
    console.warn("Could not search employee by userId:", err);
  }

  try {
    if (username) {
      const byUsername = await getDocs(
        query(collection(db, "employees"), where("username", "==", username))
      );
      collect(byUsername);
    }
  } catch (err) {
    console.warn("Could not search employee by username:", err);
  }

  return Array.from(found.values());
}

export default function ProfilePage() {
  const { user, setUser } = useUser();
  const isMobile = useIsMobile(780);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [pin, setPin] = useState("");
  const [storedPhotoURL, setStoredPhotoURL] = useState("");
  const [photoPreviewURL, setPhotoPreviewURL] = useState("");
  const [photoFile, setPhotoFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const visiblePhotoURL = useMemo(
    () => photoPreviewURL || storedPhotoURL || "",
    [photoPreviewURL, storedPhotoURL]
  );

  const visibleName = useMemo(
    () => displayName || username || "User",
    [displayName, username]
  );

  const visiblePosition = useMemo(
    () => position || getDefaultPosition(user?.role),
    [position, user?.role]
  );

  const birthdayPreview = useMemo(
    () => formatBirthdayPreview(birthdayMonth, birthdayDay),
    [birthdayMonth, birthdayDay]
  );

  const birthdayDayOptions = useMemo(() => {
    const count = getDaysInBirthdayMonth(birthdayMonth);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [birthdayMonth]);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        setMessage("");

        const userRef = doc(db, "users", user.id);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();

          setUsername(data.username || data.loginUsername || user.username || "");
          setDisplayName(
            data.displayName ||
              data.fullName ||
              data.name ||
              user.displayName ||
              ""
          );
          setPosition(
            data.position ||
              user.position ||
              getDefaultPosition(data.role || user.role)
          );

          const legacyBirthday = parseLegacyBirthday(
            data.birthDate || user.birthDate || ""
          );

          setBirthdayMonth(
            data.birthdayMonth ? String(data.birthdayMonth) : legacyBirthday.month
          );

          setBirthdayDay(
            data.birthdayDay ? String(data.birthdayDay) : legacyBirthday.day
          );

          setPin(data.pin || "");
          setStoredPhotoURL(data.profilePhotoURL || "");
        } else {
          setUsername(user.username || "");
          setDisplayName(user.displayName || "");
          setPosition(user.position || getDefaultPosition(user.role));

          const legacyBirthday = parseLegacyBirthday(user.birthDate || "");

          setBirthdayMonth(
            user.birthdayMonth ? String(user.birthdayMonth) : legacyBirthday.month
          );

          setBirthdayDay(
            user.birthdayDay ? String(user.birthdayDay) : legacyBirthday.day
          );

          setPin(user.pin || "");
          setStoredPhotoURL(user.profilePhotoURL || "");
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Error loading your profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [
    user?.id,
    user?.username,
    user?.displayName,
    user?.position,
    user?.birthDate,
    user?.birthdayMonth,
    user?.birthdayDay,
    user?.pin,
    user?.profilePhotoURL,
    user?.role,
  ]);

  useEffect(() => {
    return () => {
      if (photoPreviewURL) {
        URL.revokeObjectURL(photoPreviewURL);
      }
    };
  }, [photoPreviewURL]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setMessage("");
    setError("");

    if (!file) {
      setPhotoFile(null);
      if (photoPreviewURL) URL.revokeObjectURL(photoPreviewURL);
      setPhotoPreviewURL("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB.");
      e.target.value = "";
      return;
    }

    if (photoPreviewURL) {
      URL.revokeObjectURL(photoPreviewURL);
    }

    const localUrl = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreviewURL(localUrl);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!user?.id) {
      setError("User not found in session.");
      return;
    }

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    if (pin && pin.trim().length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    const hasBirthdayMonth = Boolean(birthdayMonth);
    const hasBirthdayDay = Boolean(birthdayDay);

    if (hasBirthdayMonth !== hasBirthdayDay) {
      setError(
        "Birthday is optional. If entered, please select both month and day."
      );
      return;
    }

    if (hasBirthdayMonth && hasBirthdayDay) {
      const maxDay = getDaysInBirthdayMonth(birthdayMonth);

      if (Number(birthdayDay) < 1 || Number(birthdayDay) > maxDay) {
        setError("Please select a valid birthday month and day.");
        return;
      }
    }

    try {
      setSaving(true);

      const userRef = doc(db, "users", user.id);
      let finalPhotoURL = storedPhotoURL || "";

      if (photoFile) {
        const extSafeName = safeFileName(
          photoFile.name || "profile-photo.jpg"
        );

        const storageRef = ref(
          storage,
          `profilePictures/${user.id}/${Date.now()}_${extSafeName}`
        );

        await uploadBytes(storageRef, photoFile, {
          contentType: photoFile.type || "image/jpeg",
        });

        finalPhotoURL = await getDownloadURL(storageRef);
      }

      const normalizedDisplayName = displayName.trim();

      const normalizedPosition =
        position.trim() || getDefaultPosition(user.role);

      const normalizedBirthdayMonth = birthdayMonth
        ? Number(birthdayMonth)
        : null;

      const normalizedBirthdayDay = birthdayDay
        ? Number(birthdayDay)
        : null;

      const normalizedPin = pin.trim();

      const payload = {
        pin: normalizedPin,
        profilePhotoURL: finalPhotoURL,
        displayName: normalizedDisplayName,
        position: normalizedPosition,
        birthDate: deleteField(),
        birthdayMonth: normalizedBirthdayMonth,
        birthdayDay: normalizedBirthdayDay,
      };

      await updateDoc(userRef, payload);

      const linkedEmployeeRefs = await findLinkedEmployeeDocs({
        userId: user.id,
        username,
      });

      if (linkedEmployeeRefs.length > 0) {
        const employeePayload = {
          displayName: normalizedDisplayName,
          position: normalizedPosition,
          birthDate: deleteField(),
          birthdayMonth: normalizedBirthdayMonth,
          birthdayDay: normalizedBirthdayDay,
          profilePhotoURL: finalPhotoURL,
        };

        await Promise.all(
          linkedEmployeeRefs.map((employeeRef) =>
            updateDoc(employeeRef, employeePayload).catch((err) => {
              console.warn("Could not sync linked employee profile:", err);
            })
          )
        );
      }

      setStoredPhotoURL(finalPhotoURL);
      setPhotoFile(null);

      if (photoPreviewURL) {
        URL.revokeObjectURL(photoPreviewURL);
      }

      setPhotoPreviewURL("");

      if (typeof setUser === "function") {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                pin: normalizedPin,
                profilePhotoURL: finalPhotoURL,
                displayName: normalizedDisplayName,
                position: normalizedPosition,
                birthDate: "",
                birthdayMonth: normalizedBirthdayMonth,
                birthdayDay: normalizedBirthdayDay,
              }
            : prev
        );
      }

      setMessage(
        linkedEmployeeRefs.length > 0
          ? "Profile updated successfully. Birthday month/day was synchronized for the dashboard."
          : "Profile updated successfully."
      );
    } catch (err) {
      console.error("Error saving profile:", err);
      setError(
        err?.message ||
          "Error saving your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <PageCard style={{ padding: 22 }} isMobile={isMobile}>
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
      <PageCard style={{ padding: 22 }} isMobile={isMobile}>
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
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 980,
        margin: "0 auto",
        paddingBottom: isMobile ? 24 : 0,
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #073b66 0%, #0f5c91 48%, #2e9fd6 100%)",
          borderRadius: isMobile ? 18 : 28,
          padding: isMobile ? 16 : 24,
          color: "#fff",
          boxShadow: "0 20px 50px rgba(23,105,170,0.20)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: isMobile ? 150 : 220,
            height: isMobile ? 150 : 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.07)",
            top: isMobile ? -60 : -80,
            right: isMobile ? -50 : -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: isMobile ? 48 : 58,
              height: isMobile ? 48 : 58,
              borderRadius: 16,
              background: "rgba(255,255,255,0.97)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <img
              src="/icons/aerostation-icon.png"
              alt={APP_NAME}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: isMobile ? 9 : 11,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.76)",
                fontWeight: 800,
              }}
            >
              {APP_NAME} {"\u00B7"} My Profile
            </p>

            <h1
              style={{
                margin: "5px 0 3px",
                fontSize: isMobile ? 22 : 30,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              My Profile
            </h1>

            {!isMobile && (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                {APP_SUBTITLE || "Operational Management Platform"}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <PageCard
          style={{ padding: isMobile ? 10 : 16 }}
          isMobile={isMobile}
        >
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#9f1239",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard
          style={{ padding: isMobile ? 10 : 16 }}
          isMobile={isMobile}
        >
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      <PageCard
        style={{ padding: isMobile ? 14 : 22 }}
        isMobile={isMobile}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(240px, 280px) 1fr",
            gap: isMobile ? 18 : 24,
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
                background:
                  "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
                border: "1px solid #dbeafe",
                borderRadius: isMobile ? 18 : 22,
                padding: isMobile ? 14 : 18,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: isMobile ? 104 : 130,
                  height: isMobile ? 104 : 130,
                  borderRadius: "999px",
                  overflow: "hidden",
                  background: "#e2e8f0",
                  margin: "0 auto 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "4px solid #ffffff",
                  boxShadow:
                    "0 10px 24px rgba(15,23,42,0.10)",
                }}
              >
                {visiblePhotoURL ? (
                  <img
                    src={visiblePhotoURL}
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
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {visibleName}
              </p>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#475569",
                  fontWeight: 700,
                }}
              >
                {visiblePosition}
              </p>

              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                @{username}
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 7,
                  marginTop: 12,
                }}
              >
                <span
                  style={{
                    padding: "6px 9px",
                    borderRadius: 999,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {getRoleLabel(user?.role)}
                </span>

                {birthdayMonth && birthdayDay && (
                  <span
                    style={{
                      padding: "6px 9px",
                      borderRadius: 999,
                      background: "#fff7ed",
                      color: "#c2410c",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {"\u{1F382}"} {birthdayPreview}
                  </span>
                )}
              </div>
            </div>

            <div>
              <FieldLabel>Profile picture</FieldLabel>

              <TextInput
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{
                  padding: "9px 10px",
                  fontSize: 13,
                }}
              />

              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 11,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                JPG / PNG. Max 5MB. A square photo works best.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSave}
            style={{
              display: "grid",
              gap: 15,
              alignContent: "start",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Profile Information
              </h2>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Keep your account details up to date. Birthday
                information is optional.
              </p>
            </div>

            <div>
              <FieldLabel>Username</FieldLabel>

              <TextInput
                value={username}
                readOnly
                disabled
                style={{
                  background: "#f8fafc",
                  color: "#64748b",
                  cursor: "not-allowed",
                }}
              />

              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 11,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Username is managed by administration and cannot be
                changed here.
              </p>
            </div>

            <div>
              <FieldLabel>Display Name</FieldLabel>

              <TextInput
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alexis Napoles"
                autoComplete="name"
              />
            </div>

            <div>
              <FieldLabel>Position</FieldLabel>

              <TextInput
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Station Manager"
              />
            </div>

            <div
              style={{
                borderRadius: 16,
                padding: isMobile ? 12 : 14,
                background:
                  "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
                border: "1px solid #fed7aa",
              }}
            >
              <FieldLabel>Birthday (Optional)</FieldLabel>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <select
                  value={birthdayMonth}
                  onChange={(e) => {
                    const nextMonth = e.target.value;
                    setBirthdayMonth(nextMonth);

                    if (!nextMonth) {
                      setBirthdayDay("");
                      return;
                    }

                    const maxDay =
                      getDaysInBirthdayMonth(nextMonth);

                    if (Number(birthdayDay) > maxDay) {
                      setBirthdayDay("");
                    }
                  }}
                  aria-label="Birthday month"
                  style={{
                    width: "100%",
                    minWidth: 0,
                    border: "1px solid #dbeafe",
                    background: "#ffffff",
                    borderRadius: 14,
                    padding: "12px 11px",
                    fontSize: 16,
                    color: birthdayMonth
                      ? "#0f172a"
                      : "#64748b",
                    outline: "none",
                  }}
                >
                  <option value="">Month</option>

                  {BIRTHDAY_MONTHS.map(
                    (monthName, index) => (
                      <option
                        key={monthName}
                        value={String(index + 1)}
                      >
                        {monthName}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={birthdayDay}
                  onChange={(e) =>
                    setBirthdayDay(e.target.value)
                  }
                  disabled={!birthdayMonth}
                  aria-label="Birthday day"
                  style={{
                    width: "100%",
                    minWidth: 0,
                    border: "1px solid #dbeafe",
                    background: birthdayMonth
                      ? "#ffffff"
                      : "#f8fafc",
                    borderRadius: 14,
                    padding: "12px 11px",
                    fontSize: 16,
                    color: birthdayDay
                      ? "#0f172a"
                      : "#64748b",
                    outline: "none",
                    cursor: birthdayMonth
                      ? "pointer"
                      : "not-allowed",
                  }}
                >
                  <option value="">Day</option>

                  {birthdayDayOptions.map((day) => (
                    <option
                      key={day}
                      value={String(day)}
                    >
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 9,
                  flexWrap: "wrap",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: "#9a3412",
                    lineHeight: 1.5,
                  }}
                >
                  Optional. For privacy, only the month and day are
                  stored. Your birth year is not requested or saved.
                </p>

                {birthdayMonth && birthdayDay && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#c2410c",
                    }}
                  >
                    Dashboard: {birthdayPreview}
                  </span>
                )}
              </div>
            </div>

            <div>
              <FieldLabel>PIN</FieldLabel>

              <TextInput
                type="password"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, ""))
                }
                placeholder="4-digit PIN"
                maxLength={10}
                inputMode="numeric"
                autoComplete="off"
              />

              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 11,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                PIN is used for selected tools and personal features.
                Do not share it.
              </p>
            </div>

            <div
              style={{
                marginTop: 2,
                position: isMobile ? "sticky" : "static",
                bottom: isMobile ? 10 : "auto",
                zIndex: 5,
              }}
            >
              <ActionButton
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save changes"}
              </ActionButton>
            </div>
          </form>
        </div>
      </PageCard>

      <PageCard
        style={{
          padding: isMobile ? 14 : 20,
        }}
        isMobile={isMobile}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(0, 1fr) auto",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {"\u{1F514}"}
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 16 : 18,
                    fontWeight: 850,
                    color: "#0f172a",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Mobile Notifications
                </h2>

                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 11.5,
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  Enable AeroStation Hub notifications on this
                  device.
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                borderRadius: 12,
                padding: "9px 10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: 10.5,
                lineHeight: 1.5,
              }}
            >
              On iPhone or iPad, AeroStation Hub should be
              installed on the Home Screen before enabling Push
              Notifications.
            </div>
          </div>

          <div
            style={{
              minWidth: isMobile ? 0 : 150,
              display: "flex",
              justifyContent: isMobile
                ? "stretch"
                : "flex-end",
            }}
          >
            <Suspense
              fallback={
                <div
                  style={{
                    width: "100%",
                    borderRadius: 13,
                    padding: "10px 12px",
                    background: "#f1f5f9",
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 800,
                    textAlign: "center",
                  }}
                >
                  Loading...
                </div>
              }
            >
              <PushNotificationsButton user={user} />
            </Suspense>
          </div>
        </div>
      </PageCard>
    </div>
  );
}

// END ProfilePage
