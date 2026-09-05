// src/pages/LoginPage.jsx

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
  APP_POWERED_BY,
  APP_COPYRIGHT,
} from "../config/appConfig.js";
import "./LoginPage.css";

const PRIVACY_POLICY_VERSION = "2026.08.26";

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

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUser();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [acceptingPrivacy, setAcceptingPrivacy] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

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

      setUser(mergedUser);

      navigate("/dashboard", {
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

      setUser(acceptedUser);

      navigate("/dashboard", {
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

          <div className="login-brand">

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
            onSubmit={handleLogin}
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
                Username
              </label>

              <input
                id="username"
                type="text"
                placeholder="Enter your username"
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
                Policy. Please review and acknowledge
                this notice before continuing.
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
                  accessed through {APP_NAME}.
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
