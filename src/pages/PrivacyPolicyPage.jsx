import React from "react";
import { useNavigate } from "react-router-dom";
import "./PrivacyPolicyPage.css";

const POLICY_VERSION = "2026.08.26";

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="privacy-page">
      <header className="privacy-page-header">
        <div className="privacy-page-header-inner">
          <div className="privacy-page-brand">
            <div className="privacy-page-logo">✈️</div>

            <div>
              <div className="privacy-page-brand-name">
                TPA OPS PLATFORM
              </div>

              <div className="privacy-page-brand-company">
                ANapoles Solutions
              </div>
            </div>
          </div>

          <button
            type="button"
            className="privacy-page-back"
            onClick={handleBack}
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="privacy-page-main">
        <section className="privacy-page-hero">
          <div className="privacy-page-badge">
            PRIVACY • CONFIDENTIALITY • OWNERSHIP
          </div>

          <h1>
            Privacy, Confidentiality
            <br />
            &amp; Ownership Policy
          </h1>

          <p>
            This policy establishes the privacy, confidentiality,
            authorized-use and ownership requirements applicable to the
            TPA OPS Platform.
          </p>

          <div className="privacy-page-meta">
            <span>
              <strong>Effective:</strong> August 26, 2026
            </span>

            <span>
              <strong>Version:</strong> {POLICY_VERSION}
            </span>

            <span>
              <strong>Platform:</strong> TPA OPS Platform
            </span>
          </div>
        </section>

        <section className="privacy-page-important">
          <div className="privacy-page-important-icon">🔒</div>

          <div>
            <strong>Confidential System Notice</strong>

            <p>
              TPA OPS Platform contains employee, operational and other
              business information intended only for authorized users.
              Information accessed through this system may not be disclosed,
              copied, distributed, published or used for unauthorized purposes.
            </p>
          </div>
        </section>

        <section className="privacy-page-content">
          <PolicySection number="01" title="Purpose">
            <p>
              TPA OPS Platform is an operational management platform designed
              to support aviation-related workforce management, scheduling,
              operational reporting, employee coordination, service tracking,
              compliance documentation and other authorized business
              activities.
            </p>

            <p>
              This policy explains how information within the platform is
              handled, establishes user responsibilities regarding confidential
              information, and identifies the ownership and administration of
              the platform.
            </p>
          </PolicySection>

          <PolicySection number="02" title="Platform Ownership">
            <p>
              TPA OPS Platform is created, administered and monitored by{" "}
              <strong>ANapoles Solutions</strong>.
            </p>

            <p>
              The platform's original design, system organization, operational
              workflows, interface structure, documentation and original
              software components are proprietary materials, except for
              third-party technologies, services, libraries, trademarks,
              materials and other components that remain the property of their
              respective owners.
            </p>

            <div className="privacy-page-highlight">
              © 2026 ANapoles Solutions. All rights reserved.
            </div>
          </PolicySection>

          <PolicySection
            number="03"
            title="Information Processed by the Platform"
          >
            <p>
              TPA OPS Platform may collect, process, store or display
              information reasonably necessary for legitimate operational and
              administrative purposes, including, as applicable:
            </p>

            <ul>
              <li>Employee names and identification information.</li>
              <li>Usernames, roles, departments and positions.</li>
              <li>Work schedules and operational assignments.</li>
              <li>Attendance and time-related information.</li>
              <li>Training and qualification information.</li>
              <li>Operational reports and records.</li>
              <li>Employee performance-related information.</li>
              <li>Requests, submissions and management approvals.</li>
              <li>Airline and flight operational information.</li>
              <li>Service and activity records.</li>
              <li>System access and activity information.</li>
              <li>
                Other information necessary for authorized operational,
                administrative, safety, security or compliance purposes.
              </li>
            </ul>
          </PolicySection>

          <PolicySection number="04" title="Purpose of Information">
            <p>
              Information processed through TPA OPS Platform may be used for
              legitimate purposes including workforce administration,
              scheduling, operational management, reporting, training,
              compliance, safety, security, service documentation, performance
              management, internal communications and authorized business
              analysis.
            </p>

            <p>
              Information contained within the platform must not be used for
              unauthorized personal, commercial or unrelated purposes.
            </p>
          </PolicySection>

          <PolicySection number="05" title="Confidentiality">
            <p>
              Information accessible through TPA OPS Platform may contain
              confidential employee, company, airline, customer, security and
              operational information.
            </p>

            <p>
              Users must maintain the confidentiality of information obtained
              through the platform. Unless specifically authorized for a
              legitimate business purpose, users must not:
            </p>

            <ul>
              <li>
                Distribute or disclose information to unauthorized individuals.
              </li>

              <li>
                Publish confidential information obtained from the platform.
              </li>

              <li>
                Forward confidential records to unauthorized recipients.
              </li>

              <li>
                Photograph or screenshot confidential information for
                unauthorized purposes.
              </li>

              <li>
                Download, export, reproduce or copy information for unauthorized
                purposes.
              </li>

              <li>
                Use information obtained through the platform for unauthorized
                personal or commercial purposes.
              </li>

              <li>
                Provide another individual unauthorized access to their
                account.
              </li>
            </ul>

            <div className="privacy-page-warning">
              <strong>Important:</strong> Access to information does not
              constitute authorization to disclose or distribute that
              information.
            </div>
          </PolicySection>

          <PolicySection number="06" title="Access Control">
            <p>
              Access to TPA OPS Platform is restricted to authorized users.
              Role-based permissions may determine which modules, reports,
              records and administrative functions an individual user is
              permitted to access.
            </p>

            <p>
              Users are responsible for protecting their login credentials and
              must not share usernames, PINs, passwords or other authentication
              credentials.
            </p>

            <p>
              Attempts to bypass access restrictions or obtain information
              outside an individual's authorized responsibilities are
              prohibited.
            </p>
          </PolicySection>

          <PolicySection
            number="07"
            title="Monitoring and System Activity"
          >
            <p>
              For operational integrity, security, troubleshooting, compliance
              and system administration purposes, TPA OPS Platform may maintain
              records relating to system access, user activity and platform
              usage.
            </p>

            <p>
              TPA OPS Platform is administered and monitored by{" "}
              <strong>ANapoles Solutions</strong> and/or specifically authorized
              administrators.
            </p>

            <p>
              Monitoring must be conducted for legitimate administrative,
              operational, security or compliance purposes.
            </p>
          </PolicySection>

          <PolicySection number="08" title="Data Security">
            <p>
              Reasonable administrative and technical safeguards are intended
              to protect information against unauthorized access, disclosure,
              alteration, misuse, loss or destruction.
            </p>

            <p>
              Security measures may include authentication, role-based
              permissions, access restrictions, activity records, database
              security controls and other appropriate safeguards.
            </p>

            <p>
              No electronic system can guarantee absolute security. Users must
              promptly report suspected unauthorized access, compromised
              credentials, data exposure or other security incidents through
              the appropriate management or administrative channel.
            </p>
          </PolicySection>

          <PolicySection
            number="09"
            title="Data Sharing and Disclosure"
          >
            <p>
              Personal or confidential information contained within TPA OPS
              Platform must not be sold, publicly distributed or disclosed to
              unauthorized third parties.
            </p>

            <p>
              Information may be shared when reasonably necessary for
              authorized business operations, when authorized by the
              appropriate organization or data owner, or when disclosure is
              required by applicable law, regulation, legal process or
              governmental authority.
            </p>
          </PolicySection>

          <PolicySection number="10" title="Data Retention">
            <p>
              Information should be maintained only for as long as reasonably
              necessary for its legitimate operational, administrative,
              compliance, legal or business purpose, subject to applicable
              organizational retention requirements.
            </p>

            <p>
              Records that are no longer required should be appropriately
              deleted, archived or otherwise handled according to applicable
              retention requirements.
            </p>
          </PolicySection>

          <PolicySection number="11" title="User Responsibilities">
            <p>
              By accessing TPA OPS Platform, users are responsible for:
            </p>

            <ul>
              <li>Using the platform only for authorized purposes.</li>

              <li>
                Maintaining the confidentiality of information accessed through
                the platform.
              </li>

              <li>Protecting their login credentials.</li>

              <li>
                Accessing only information required for their assigned
                responsibilities.
              </li>

              <li>
                Refraining from unauthorized copying, disclosure or
                distribution.
              </li>

              <li>
                Following applicable company, airline, airport, safety, security
                and privacy requirements.
              </li>

              <li>
                Reporting suspected unauthorized access or disclosure.
              </li>
            </ul>

            <p>
              Violations may result in restriction or termination of platform
              access and may also result in appropriate administrative or
              disciplinary action under applicable organizational policies.
            </p>
          </PolicySection>

          <PolicySection number="12" title="Intellectual Property">
            <p>
              Original software, interface organization, workflows, platform
              architecture, documentation, reports, forms, designs and other
              original components developed specifically for TPA OPS Platform
              may constitute intellectual property of their respective owner.
            </p>

            <p>
              Nothing in this policy transfers ownership or intellectual
              property rights to an authorized user merely because that user
              has been granted access to the platform.
            </p>

            <p>
              Users may not reproduce, redistribute, commercially exploit or
              create unauthorized copies of proprietary platform components
              except where expressly authorized or otherwise permitted by
              applicable law.
            </p>

            <p>
              Third-party software, libraries, services, logos, trademarks,
              airline names, airport identifiers and other third-party
              intellectual property remain the property of their respective
              owners.
            </p>
          </PolicySection>

          <PolicySection
            number="13"
            title="No Transfer of Ownership Through Access"
          >
            <p>
              Access to TPA OPS Platform constitutes permission to use the
              system for authorized purposes. It does not grant the user any
              ownership interest in the platform, source code, proprietary
              workflows, documentation or other protected materials.
            </p>
          </PolicySection>

          <PolicySection number="14" title="Policy Updates">
            <p>
              This policy may be revised as the platform evolves, new
              functionality is introduced, operational requirements change or
              additional privacy, security, legal or compliance requirements
              become applicable.
            </p>

            <p>
              When a new policy version requires acknowledgment, TPA OPS
              Platform may require users to review and accept the updated
              version before continuing access.
            </p>
          </PolicySection>

          <PolicySection number="15" title="User Acknowledgment">
            <p>
              Users may be required to acknowledge the current version of this
              policy before accessing TPA OPS Platform.
            </p>

            <p>
              The platform may record the policy version and date and time of
              acknowledgment for administrative, security and compliance
              purposes.
            </p>

            <div className="privacy-page-warning">
              <strong>
                Unauthorized access, use, reproduction, disclosure or
                distribution of confidential information contained within TPA
                OPS Platform is prohibited.
              </strong>
            </div>
          </PolicySection>
        </section>

        <section className="privacy-page-owner">
          <div className="privacy-page-owner-logo">AN</div>

          <div>
            <div className="privacy-page-owner-title">
              ANapoles Solutions
            </div>

            <p>
              TPA OPS Platform is created, administered and monitored by
              ANapoles Solutions.
            </p>

            <span>
              © 2026 ANapoles Solutions. All rights reserved.
            </span>
          </div>
        </section>
      </main>

      <footer className="privacy-page-footer">
        <strong>TPA OPS Platform</strong>

        <span>•</span>

        <span>Privacy Policy Version {POLICY_VERSION}</span>

        <span>•</span>

        <span>ANapoles Solutions</span>
      </footer>
    </div>
  );
}

function PolicySection({ number, title, children }) {
  return (
    <section className="privacy-policy-section">
      <div className="privacy-policy-number">{number}</div>

      <div className="privacy-policy-section-content">
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}
