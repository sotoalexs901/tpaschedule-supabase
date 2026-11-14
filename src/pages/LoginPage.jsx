// src/pages/LoginPage.jsx

import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
  APP_POWERED_BY,
  APP_COPYRIGHT,
} from "../config/appConfig.js";
import "./LoginPage.css";
import { startUmnrSession } from "../utils/umnrClient.js";

const PRIVACY_POLICY_VERSION = "2026.10.20";
// One AeroStation Hub login. The UMNR token exchange happens silently,
// only after the employee has accepted the privacy policy.
// Never block the existing WCHR login if UMNR backend is unavailable.
async function authorizeUmnrSilently(username, pin) {
  if (import.meta.env.VITE_UMNR_ENABLED !== "true") return;
  try {
    await startUmnrSession(username, pin);
  } catch (error) {
    console.warn("UMNR authorization unavailable:", error?.message || "Unavailable");
  }
}


function normalizeCabinServiceValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "Cabin Service";
  }

  return String(value || "").trim();
}

function normalizeSupervisorPosition(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "supervisor") return "DL Supervisor";
  if (raw === "dl supervisor") return "DL Supervisor";

  return String(value || "").trim();
}

// Seasonal artwork follows Tampa station dates (America/New_York).
// Boundaries are inclusive at midnight on the starting date and exclusive
// at midnight on the ending date. No banner is shown from Feb 16, 2027.
function getLoginCelebration(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  if (day < "2026-12-01") return {
    kind: "birthday", iconLeft: "🥳", iconMain: "🎂", iconRight: "🎉",
    title: "We're turning ONE! 🎈",
    subtitle: "Happy 1st Birthday, AeroStation Hub!",
    note: "One year of smarter operations. Thank you to our amazing team!",
  };
  if (day < "2026-12-26") return {
    kind: "christmas", iconLeft: "🎅", iconMain: "🎄", iconRight: "⛄",
    title: "Merry Christmas! ✨",
    subtitle: "Season's Greetings from AeroStation Hub",
    note: "Wishing our entire team a joyful and safe holiday season!",
  };
  if (day < "2027-02-16") return {
    kind: "newyear", iconLeft: "🥳", iconMain: "🎆", iconRight: "🎉",
    title: "Happy New Year 2027! ✨",
    subtitle: "A new year of teamwork and smarter operations",
    note: "Thank you for keeping our station moving. Here's to a great 2027!",
  };
  return null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const celebration = getLoginCelebration();
  const location = useLocation();
  const { user, setUser } = useUser();

  const requestedReturnPath = String(location.state?.from || "").trim();

  const returnPath =
    requestedReturnPath.startsWith("/") &&
    !requestedReturnPath.startsWith("//") &&
    requestedReturnPath !== "/login"
      ? requestedReturnPath
      : "/dashboard";

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailPilotMode, setEmailPilotMode] = useState(false);
  const [emailHelp, setEmailHelp] = useState("");
  const pilotEnabled = import.meta.env.VITE_EMAIL_LOGIN_ENABLED === "true";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [acceptingPrivacy, setAcceptingPrivacy] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    if (user) {
      navigate(returnPath, { replace: true });
    }
  }, [user, navigate, returnPath]);

  const handleEmailPilot = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setEmailHelp("");
    try {
      setLoading(true);
      const credential = await signInWithEmailAndPassword(auth, username.trim().toLowerCase(), emailPassword);
      const token = await credential.user.getIdToken();
      const response = await fetch("/.netlify/functions/employee-auth-profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload.user) throw new Error(payload.error || "Employee account is not linked.");
      setUser(payload.user);
      navigate(returnPath, { replace: true });
    } catch (err) {
      await signOut(auth).catch(() => {});
      setError(err?.message || "Email sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPasswordReset = async () => {
    const email = username.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Enter your email address first.");
      return;
    }
    setError("");
    setEmailHelp("");
    try {
      await sendPasswordResetEmail(auth, email);
      setEmailHelp("If this account is enabled, a password reset email will arrive shortly.");
    } catch (err) {
      // Do not disclose whether an employee email exists.
      console.warn("Password reset request could not be completed", err?.code);
      setEmailHelp("If this account is enabled, a password reset email will arrive shortly.");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");

    const cleanUsername = String(username || "")
      .trim()
      .toLowerCase();

    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin) {
      setError("Please enter your username and PIN.");
      return;
    }

    try {
      setLoading(true);

      const userQuery = query(
        collection(db, "users"),
        where("username", "==", cleanUsername)
      );

      const userSnap = await getDocs(userQuery);

      if (userSnap.empty) {
        setError("Invalid username or PIN.");
        return;
      }

      const userDoc = userSnap.docs[0];

      const userData = {
        id: userDoc.id,
        ...userDoc.data(),
      };

      if (String(userData.pin || "") !== cleanPin) {
        setError("Invalid username or PIN.");
        return;
      }

      let employeeData = null;

      if (userData.employeeId) {
        const employeeByIdQuery = query(
          collection(db, "employees"),
          where("__name__", "==", userData.employeeId)
        );

        const employeeByIdSnap = await getDocs(employeeByIdQuery);

        if (!employeeByIdSnap.empty) {
          employeeData = {
            id: employeeByIdSnap.docs[0].id,
            ...employeeByIdSnap.docs[0].data(),
          };
        }
      }

      if (!employeeData) {
        const employeeByUsernameQuery = query(
          collection(db, "employees"),
          where("loginUsername", "==", cleanUsername)
        );

        const employeeByUsernameSnap = await getDocs(
          employeeByUsernameQuery
        );

        if (!employeeByUsernameSnap.empty) {
          employeeData = {
            id: employeeByUsernameSnap.docs[0].id,
            ...employeeByUsernameSnap.docs[0].data(),
          };
        }
      }

      const mergedUser = {
        ...userData,

        employeeId:
          userData.employeeId ||
          employeeData?.id ||
          "",

        department: normalizeCabinServiceValue(
          employeeData?.department ||
            userData?.department ||
            ""
        ),

        position: normalizeSupervisorPosition(
          employeeData?.position ||
            userData?.position ||
            ""
        ),

        employeeName:
          employeeData?.name ||
          userData?.displayName ||
          userData?.fullName ||
          userData?.name ||
          userData?.username ||
          "",
      };


      const hasAcceptedCurrentPolicy =
        userData.privacyPolicyAccepted === true &&
        userData.privacyPolicyVersion === PRIVACY_POLICY_VERSION;

      if (!hasAcceptedCurrentPolicy) {
        setPendingUser(mergedUser);
        setPrivacyChecked(false);
        setShowPrivacyModal(true);
        return;
      }

      await authorizeUmnrSilently(cleanUsername, cleanPin);
      setUser(mergedUser);

      navigate(returnPath, {
        replace: true,
      });
    } catch (err) {
      console.error("Login error:", err);

      setError(
        "There was a problem signing in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptPrivacy = async () => {
    if (
      !privacyChecked ||
      !pendingUser ||
      acceptingPrivacy
    ) {
      return;
    }

    try {
      setAcceptingPrivacy(true);
      setError("");

      await updateDoc(
        doc(db, "users", pendingUser.id),
        {
          privacyPolicyAccepted: true,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          privacyPolicyAcceptedAt: serverTimestamp(),
        }
      );

      const acceptedUser = {
        ...pendingUser,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      };

      setShowPrivacyModal(false);
      setPrivacyChecked(false);
      setPendingUser(null);

      await authorizeUmnrSilently(String(acceptedUser.username || username).trim().toLowerCase(), pin.trim());
      setUser(acceptedUser);

      navigate(returnPath, {
        replace: true,
      });
    } catch (err) {
      console.error(
        "Privacy acceptance error:",
        err
      );

      setError(
        "We could not save your privacy acknowledgment. Please try again."
      );
    } finally {
      setAcceptingPrivacy(false);
    }
  };

  const handleCancelPrivacy = () => {
    if (acceptingPrivacy) return;

    setShowPrivacyModal(false);
    setPrivacyChecked(false);
    setPendingUser(null);

    setPin("");
    setError("");
  };

  return (
    <div className="login-container">

      <div className="login-left">
        <div className="login-overlay-content">

          <div className="login-overlay-tag">
            {APP_NAME}
          </div>

          <h1 className="login-overlay-title">
            Smarter operations,
            <br />
            better station control.
          </h1>

          <p className="login-overlay-text">
            Manage schedules, communications, approvals,
            operational reports, employee activity and
            real-time station updates from one modern
            platform built for aviation operations.
          </p>

        </div>
      </div>

      <div className="login-right">
        <div className="login-card">

          {celebration && (
            <section className={`login-birthday login-celebration-${celebration.kind}`} aria-label={celebration.subtitle}>
              <div className="login-birthday-confetti" aria-hidden="true">✦ · ✨ · ✦ · ✨ · ✦</div>
              <div className="login-birthday-characters" aria-hidden="true">
                <span className="birthday-dancer birthday-dancer-left">{celebration.iconLeft}</span>
                <span className="birthday-cake">{celebration.iconMain}</span>
                <span className="birthday-dancer birthday-dancer-right">{celebration.iconRight}</span>
              </div>
              <div className="login-birthday-heading">{celebration.title}</div>
              <p className="login-birthday-copy">{celebration.subtitle}</p>
              <p className="login-birthday-thanks">{celebration.note}</p>
            </section>
          )}

          <div className="login-brand">

            <div className={`login-logo-seasonal-frame${celebration ? ` login-logo-${celebration.kind}` : ""}`}>
              {celebration && (
                <div className="login-logo-seasonal-decor" aria-hidden="true">
                  <span className="login-logo-decor-top">{celebration.kind === "birthday" ? "🎈" : celebration.kind === "christmas" ? "❄️" : "✨"}</span>
                  <span className="login-logo-decor-left">{celebration.kind === "birthday" ? "🎉" : celebration.kind === "christmas" ? "🎄" : "🎆"}</span>
                  <span className="login-logo-decor-right">{celebration.kind === "birthday" ? "🥳" : celebration.kind === "christmas" ? "🎁" : "🥂"}</span>
                </div>
              )}
              <div className="login-brand-icon">
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

            </div>

            <div className="login-brand-text">

              <p className="login-brand-title">
                {APP_NAME}
              </p>

              <p className="login-brand-subtitle">
                {APP_SUBTITLE}
              </p>

            </div>

          </div>

          <form
            className="login-box"
            onSubmit={emailPilotMode ? handleEmailPilot : handleLogin}
          >

            <h1 className="login-title">
              Welcome back
            </h1>

            <p className="login-subtitle">
              Sign in to continue to your operations
              management platform.
            </p>

            {error && !showPrivacyModal && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="login-field">

              <label htmlFor="username">
                {emailPilotMode ? "Email" : "Username"}
              </label>

              <input
                id="username"
                type="text"
                placeholder={emailPilotMode ? "Enter your email" : "Enter your username"}
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
              />

            </div>

            {!emailPilotMode ? (
            <div className="login-field">

              <label htmlFor="pin">
                PIN
              </label>

              <input
                id="pin"
                type="password"
                placeholder="Enter your 4-digit PIN"
                value={pin}
                maxLength={4}
                onChange={(e) =>
                  setPin(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4)
                  )
                }
                autoComplete="current-password"
                disabled={loading}
              />

            </div>

            ) : (
              <div className="login-field">
                <label htmlFor="email-password">Password</label>
                <input id="email-password" type="password" value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password" disabled={loading} />
              </div>
            )}

            {pilotEnabled && emailPilotMode && (
              <div style={{ marginBottom: 12 }}>
                <button type="button" onClick={handleEmailPasswordReset} disabled={loading}>
                  Forgot password?
                </button>
                {emailHelp && <p role="status">{emailHelp}</p>}
              </div>
            )}

            {pilotEnabled && (
              <button type="button" onClick={() => { setEmailPilotMode((v) => !v); setError(""); setUsername(""); }}
                disabled={loading} style={{ marginBottom: 12 }}>
                {emailPilotMode ? "Use username and PIN" : "Try email sign-in (pilot)"}
              </button>
            )}

            <div className="login-row">

              <span className="login-helper-text">
                Access for station managers,
                supervisors and agents.
              </span>

            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign In"}
            </button>

            <p className="login-footer-note">
              Secure access to schedules, team updates,
              approvals, reports and daily station operations.
            </p>

            <div className="login-ownership">

              <p className="login-ownership-company">
                {APP_POWERED_BY}
              </p>

              <p>
                {APP_COPYRIGHT}
              </p>

              <p className="login-ownership-managed">
                Created, administered and monitored by{" "}
                <strong>ANapoles Solutions</strong>
              </p>

              <Link
                to="/privacy"
                className="login-policy-footer-link"
              >
                Privacy, Confidentiality &amp; Ownership
              </Link>

            </div>

          </form>

        </div>
      </div>

      {showPrivacyModal && pendingUser && (

        <div className="privacy-modal-backdrop">

          <div
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
          >

            <div className="privacy-modal-header">

              <div className="privacy-modal-icon">
                {"\u{1F512}"}
              </div>

              <div>

                <p className="privacy-modal-label">
                  PRIVACY NOTICE
                </p>

                <h2 id="privacy-modal-title">
                  Privacy &amp; Confidentiality
                </h2>

              </div>

            </div>

            <div className="privacy-modal-body">

              <p className="privacy-welcome">
                Welcome{" "}
                <strong>
                  {pendingUser.employeeName ||
                    pendingUser.username}
                </strong>
                .
              </p>

              <p>
                {APP_NAME} has implemented its
                Privacy, Confidentiality &amp; Ownership
                Policy, updated October 20, 2026.
                Please review the update before continuing.
              </p>

              <div className="privacy-notice">

                <strong>
                  Confidential System
                </strong>

                <p>
                  {APP_NAME} contains employee,
                  personal, airline and operational
                  information intended exclusively for
                  authorized business use.
                </p>

              </div>

              <div className="privacy-notice" style={{ borderLeft: "4px solid #1769aa" }}>
                <strong>October 2026 Update — WCHR Live Location</strong>
                <p>
                  AeroStation Hub may use approximate live location for WCHR
                  service coordination, authorized operational monitoring, and
                  advisory dispatch. Tracking requires an active Punch In,
                  separately enabled live-location consent, and permission
                  from the device or browser.
                </p>
                <p>
                  Tracking stops on Punch Out or withdrawal of live-location
                  consent. GPS accuracy varies and does not automatically
                  assign services.
                </p>
                <p>
                  <strong>Important:</strong> Accepting this policy confirms
                  that you have been informed of this update. It does not
                  activate GPS or replace separate live-location consent.
                </p>
              </div>

              <div className="privacy-rules">

                <p>
                  By accessing this platform, you
                  acknowledge that:
                </p>

                <ul>

                  <li>
                    Information contained within the
                    platform must be treated as
                    confidential.
                  </li>

                  <li>
                    Personal and operational information
                    may only be accessed for legitimate
                    business purposes.
                  </li>

                  <li>
                    Unauthorized copying, screenshots,
                    photographs, disclosure or
                    distribution of information is
                    prohibited.
                  </li>

                  <li>
                    Your username and PIN are personal
                    and must not be shared with another
                    person.
                  </li>

                  <li>
                    Unauthorized access or misuse of
                    information may result in restriction
                    of system access and appropriate
                    disciplinary action.
                  </li>

                </ul>

              </div>

              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="privacy-read-full"
              >
                Read Full Privacy, Confidentiality &amp;
                Ownership Policy {"\u2192"}
              </Link>

              {error && (
                <div className="login-error">
                  {error}
                </div>
              )}

              <label className="privacy-acknowledgment">

                <input
                  type="checkbox"
                  checked={privacyChecked}
                  onChange={(e) =>
                    setPrivacyChecked(
                      e.target.checked
                    )
                  }
                  disabled={acceptingPrivacy}
                />

                <span>
                  I have read and acknowledge the{" "}
                  <strong>
                    Privacy, Confidentiality &amp;
                    Ownership Policy
                  </strong>{" "}
                  and understand my responsibility to
                  protect confidential information
                  accessed through {APP_NAME}. I also acknowledge
                  the October 2026 WCHR live-location notice and understand
                  that location tracking requires separate consent and
                  an active Punch In.
                </span>

              </label>

            </div>

            <div className="privacy-modal-footer">

              <button
                type="button"
                className="privacy-cancel-button"
                onClick={handleCancelPrivacy}
                disabled={acceptingPrivacy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="privacy-accept-button"
                onClick={handleAcceptPrivacy}
                disabled={
                  !privacyChecked ||
                  acceptingPrivacy
                }
              >
                {acceptingPrivacy
                  ? "Saving..."
                  : "Accept & Continue"}
              </button>

            </div>

            <div className="privacy-policy-version">

              <span>
                Policy Version:{" "}
                {PRIVACY_POLICY_VERSION}
              </span>

              <span>
                {APP_NAME} {"\u00A9"} 2026 ANapoles Solutions
              </span>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
