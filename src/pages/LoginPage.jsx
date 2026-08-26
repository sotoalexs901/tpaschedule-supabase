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
import "./LoginPage.css";

// ============================================================
// PRIVACY POLICY
// Change this version only when a new acknowledgment
// must be required from all users.
// ============================================================

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

  // ==========================================================
  // PRIVACY ACKNOWLEDGMENT
  // ==========================================================

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [acceptingPrivacy, setAcceptingPrivacy] = useState(false);

  // Authenticated user waiting for privacy acceptance
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // ==========================================================
  // LOGIN
  // ==========================================================

  const handleLogin = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");

    const cleanUsername = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin) {
      setError("Please enter your username and PIN.");
      return;
    }

    try {
      setLoading(true);

      // ------------------------------------------------------
      // FIND USER
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // VERIFY PIN
      // ------------------------------------------------------

      if (String(userData.pin || "") !== cleanPin) {
        setError("Invalid username or PIN.");
        return;
      }

      // ------------------------------------------------------
      // FIND EMPLOYEE INFORMATION
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // FALLBACK: FIND EMPLOYEE BY USERNAME
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // BUILD USER PROFILE
      // ------------------------------------------------------

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

      // ======================================================
      // PRIVACY POLICY VERSION CHECK
      // ======================================================
      //
      // CURRENT USERS:
      // They will see the new notice once because they do not
      // yet have this policy version recorded.
      //
      // NEW USERS:
      // They will also see it on their first login.
      //
      // AFTER ACCEPTANCE:
      // They will not see it again unless the policy version
      // is changed in the future.
      // ======================================================

      const hasAcceptedCurrentPolicy =
        userData.privacyPolicyAccepted === true &&
        userData.privacyPolicyVersion === PRIVACY_POLICY_VERSION;

      if (!hasAcceptedCurrentPolicy) {
        setPendingUser(mergedUser);
        setPrivacyChecked(false);
        setShowPrivacyModal(true);
        return;
      }

      // ------------------------------------------------------
      // POLICY ALREADY ACCEPTED
      // NORMAL LOGIN
      // ------------------------------------------------------

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

  // ==========================================================
  // ACCEPT PRIVACY POLICY
  // ==========================================================

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

      // ------------------------------------------------------
      // SAVE ACKNOWLEDGMENT
      // ------------------------------------------------------

      await updateDoc(
        doc(db, "users", pendingUser.id),
        {
          privacyPolicyAccepted: true,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          privacyPolicyAcceptedAt: serverTimestamp(),
        }
      );

      // ------------------------------------------------------
      // UPDATE SESSION USER
      // ------------------------------------------------------

      const acceptedUser = {
        ...pendingUser,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      };

      setShowPrivacyModal(false);
      setPrivacyChecked(false);
      setPendingUser(null);

      // ------------------------------------------------------
      // LOGIN
      // ------------------------------------------------------

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

  // ==========================================================
  // CANCEL PRIVACY ACKNOWLEDGMENT
  // ==========================================================

  const handleCancelPrivacy = () => {
    if (acceptingPrivacy) return;

    setShowPrivacyModal(false);
    setPrivacyChecked(false);
    setPendingUser(null);

    // Require PIN again
    setPin("");
    setError("");
  };

  return (
    <div className="login-container">

      {/* =====================================================
          LEFT SIDE
      ===================================================== */}

      <div className="login-left">

        <div className="login-overlay-content">

          <div className="login-overlay-tag">
            TPA OPS SYSTEM
          </div>

          <h1 className="login-overlay-title">
            Smarter scheduling,
            <br />
            cleaner operations.
          </h1>

          <p className="login-overlay-text">
            Manage schedules, communications, approvals,
            employee restrictions, budgets and operational
            updates from one modern platform built for
            station teams.
          </p>

        </div>

      </div>

      {/* =====================================================
          RIGHT SIDE
      ===================================================== */}

      <div className="login-right">

        <div className="login-card">

          {/* BRAND */}

          <div className="login-brand">

            <div className="login-brand-icon">
              ✈️
            </div>

            <div className="login-brand-text">

              <p className="login-brand-title">
                TPA OPS SYSTEM
              </p>

              <p className="login-brand-subtitle">
                Airline operations dashboard
              </p>

            </div>

          </div>

          {/* =================================================
              LOGIN FORM
          ================================================= */}

          <form
            className="login-box"
            onSubmit={handleLogin}
          >

            <h1 className="login-title">
              Welcome back
            </h1>

            <p className="login-subtitle">
              Sign in to continue to your scheduling and
              operations dashboard.
            </p>

            {error && !showPrivacyModal && (
              <div className="login-error">
                {error}
              </div>
            )}

            {/* USERNAME */}

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
                disabled={loading}
              />

            </div>

            {/* PIN */}

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

            {/* ACCESS MESSAGE */}

            <div className="login-row">

              <span className="login-helper-text">
                Access for station managers,
                supervisors and agents.
              </span>

            </div>

            {/* SIGN IN */}

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
              approvals and daily station operations.
            </p>

            {/* =================================================
                ANAPOLES SOLUTIONS
                ALWAYS VISIBLE ON LOGIN
            ================================================= */}

            <div className="login-ownership">

              <p className="login-ownership-company">
                TPA OPS Platform
              </p>

              <p>
                © 2026 ANapoles Solutions.
                All rights reserved.
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

      {/* =====================================================
          PRIVACY POLICY ACKNOWLEDGMENT MODAL
      ===================================================== */}

      {showPrivacyModal && pendingUser && (

        <div className="privacy-modal-backdrop">

          <div
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
          >

            {/* HEADER */}

            <div className="privacy-modal-header">

              <div className="privacy-modal-icon">
                🔒
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

            {/* BODY */}

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
                TPA OPS Platform has implemented its
                Privacy, Confidentiality &amp; Ownership
                Policy. Please review and acknowledge
                this notice before continuing.
              </p>

              {/* CONFIDENTIAL SYSTEM */}

              <div className="privacy-notice">

                <strong>
                  Confidential System
                </strong>

                <p>
                  TPA OPS Platform contains employee,
                  personal, airline and operational
                  information intended exclusively for
                  authorized business use.
                </p>

              </div>

              {/* PRIVACY RULES */}

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

              {/* FULL POLICY */}

              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="privacy-read-full"
              >
                Read Full Privacy, Confidentiality &amp;
                Ownership Policy →
              </Link>

              {/* ERROR */}

              {error && (
                <div className="login-error">
                  {error}
                </div>
              )}

              {/* ACKNOWLEDGMENT */}

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
                  accessed through TPA OPS Platform.
                </span>

              </label>

            </div>

            {/* FOOTER */}

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

            {/* POLICY INFORMATION */}

            <div className="privacy-policy-version">

              <span>
                Policy Version:{" "}
                {PRIVACY_POLICY_VERSION}
              </span>

              <span>
                TPA OPS Platform © 2026 ANapoles Solutions
              </span>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
