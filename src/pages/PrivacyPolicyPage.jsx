import React from "react";
import { useNavigate } from "react-router-dom";
import {
  APP_NAME,
  APP_SUBTITLE,
  APP_POWERED_BY,
  APP_COPYRIGHT,
} from "../config/appConfig.js";
import "./PrivacyPolicyPage.css";

const POLICY_VERSION = "2026.09.04";
const PLATFORM_VERSION = "1.7";
const OFFICIAL_DOMAIN = "aerostationhub.com";

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
            <div className="privacy-page-logo">
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

            <div>
              <div className="privacy-page-brand-name">
                {APP_NAME}
              </div>

              <div className="privacy-page-brand-company">
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="privacy-page-back"
            onClick={handleBack}
          >
            {"\u2190"} Back
          </button>
        </div>
      </header>

      <main className="privacy-page-main">
        <section className="privacy-page-hero">
          <div className="privacy-page-badge">
            PRIVACY {"\u2022"} CONFIDENTIALITY {"\u2022"} OWNERSHIP
          </div>

          <h1>
            Privacy, Confidentiality
            <br />
            &amp; Ownership Policy
          </h1>

          <p>
            This policy establishes the privacy, confidentiality,
            authorized-use, mobile notification and ownership requirements
            applicable to the {` ${APP_NAME}`}.
          </p>

          <div className="privacy-page-meta">
            <span>
              <strong>Effective:</strong> September 4, 2026
            </span>

            <span>
              <strong>Policy Version:</strong> {POLICY_VERSION}
            </span>

            <span>
              <strong>Platform Update:</strong> {PLATFORM_VERSION}
            </span>

            <span>
              <strong>Platform:</strong> {APP_NAME}
            </span>
          </div>
        </section>

        <section className="privacy-page-important">
          <div className="privacy-page-important-icon">
            {"\u{1F512}"}
          </div>

          <div>
            <strong>Confidential System Notice</strong>

            <p>
              {APP_NAME} contains employee, operational and other
              business information intended only for authorized users.
              Information accessed through this system may not be disclosed,
              copied, distributed, published or used for unauthorized purposes.
              Mobile notifications may display limited operational information
              on a user's device and should be protected accordingly.
            </p>
          </div>
        </section>

        <section className="privacy-page-content">
          <PolicySection number="01" title="Purpose">
            <p>
              {APP_NAME} is an operational management platform designed
              to support aviation-related workforce management, scheduling,
              operational reporting, employee coordination, service tracking,
              compliance documentation, internal communications and other
              authorized business activities.
            </p>

            <p>
              This policy explains how information within the platform is
              handled, establishes user responsibilities regarding confidential
              information, describes the use of mobile and Push notifications,
              and identifies the ownership and administration of the platform.
            </p>
          </PolicySection>

          <PolicySection number="02" title="Official Platform Access">
            <p>
              The official web address for {APP_NAME} is{" "}
              <strong>{OFFICIAL_DOMAIN}</strong>.
            </p>

            <p>
              Users should access the platform only through the official domain
              or through an authorized Home Screen installation created from
              that domain. Users should not enter login credentials into
              unofficial, copied or unverified websites that claim to represent
              {APP_NAME}.
            </p>

            <p>
              {APP_NAME} may be installed on supported mobile devices as
              a Progressive Web App or Home Screen application. Installing the
              platform does not transfer ownership of the software or create a
              separate user account.
            </p>
          </PolicySection>

          <PolicySection number="03" title="Platform Ownership">
            <p>
              {APP_NAME} is created, administered and monitored by{" "}
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
              {APP_COPYRIGHT}
            </div>
          </PolicySection>

          <PolicySection
            number="04"
            title="Information Processed by the Platform"
          >
            <p>
              {APP_NAME} may collect, process, store or display
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
              <li>Internal direct messages between authorized users.</li>
              <li>
                Mobile notification registration information, including device
                notification tokens and notification enablement status.
              </li>
              <li>System access and activity information.</li>
              <li>
                Other information necessary for authorized operational,
                administrative, safety, security or compliance purposes.
              </li>
            </ul>
          </PolicySection>

          <PolicySection number="05" title="Purpose of Information">
            <p>
              Information processed through {APP_NAME} may be used for
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

          <PolicySection
            number="06"
            title="Mobile Notifications and Push Alerts"
          >
            <p>
              {APP_NAME} may allow authorized users to enable mobile Push
              notifications on supported devices. Push notifications are
              associated with the user account and device on which notification
              access was enabled.
            </p>

            <p>
              Depending on the user's role and activity within the platform,
              notifications may include:
            </p>

            <ul>
              <li>Direct messages from another authorized user.</li>
              <li>Timesheet submission, approval or return status.</li>
              <li>Schedule submission, approval or return status.</li>
              <li>Notice that a new approved schedule is available.</li>
              <li>Operational alerts intended for authorized management roles.</li>
              <li>
                Other authorized operational notifications introduced in future
                platform updates.
              </li>
            </ul>

            <div className="privacy-page-warning">
              <strong>Important:</strong> A Push notification may appear on a
              device lock screen, notification center or other system interface
              depending on the user's device settings. Users are responsible
              for protecting devices that receive {APP_NAME} notifications.
            </div>
          </PolicySection>

          <PolicySection
            number="07"
            title="Notification Content and Privacy"
          >
            <p>
              Push notifications are intended to provide concise operational
              information. Depending on the notification type, a notification
              may display a sender name, message preview, schedule status,
              timesheet status, operational alert summary or similar limited
              information.
            </p>

            <p>
              Users should avoid leaving devices that display notifications
              unattended or accessible to unauthorized persons. Device-level
              privacy controls, including lock screen notification settings,
              remain controlled by the user and the device operating system.
            </p>

            <p>
              Users who do not want notification content displayed outside the
              application may adjust their device notification settings or
              disable Mobile Notifications within {APP_NAME}, where available.
            </p>
          </PolicySection>

          <PolicySection
            number="08"
            title="Notification Delivery and Operational Responsibility"
          >
            <p>
              Push notifications are provided as an operational convenience and
              communication aid. Delivery may depend on internet connectivity,
              device settings, operating system behavior, browser permissions,
              notification services and other technical factors outside the
              direct control of {APP_NAME}.
            </p>

            <p>
              A delayed, blocked or undelivered Push notification does not
              replace a user's responsibility to access the platform, review
              assigned schedules, monitor applicable work responsibilities and
              follow authorized management instructions.
            </p>

            <p>
              Users should periodically open {APP_NAME} directly to verify
              schedules, messages, approvals and other information applicable
              to their responsibilities.
            </p>
          </PolicySection>

          <PolicySection
            number="09"
            title="Shared, Lost or Reassigned Devices"
          >
            <p>
              Users should not leave their {APP_NAME} account active on a
              shared, lost, sold, transferred or reassigned device.
            </p>

            <p>
              When using a shared device, users are responsible for signing out
              after use. If a device is lost, replaced or no longer under the
              user's control, the user should promptly notify the appropriate
              administrator when necessary and should disable access or
              notifications where reasonably possible.
            </p>

            <p>
              Users should not enable persistent Push notifications for another
              employee's account on their personal device unless specifically
              authorized for a legitimate operational purpose.
            </p>
          </PolicySection>

          <PolicySection number="10" title="Confidentiality">
            <p>
              Information accessible through {APP_NAME} may contain
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
                Forward confidential records or direct messages to unauthorized
                recipients.
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

          <PolicySection number="11" title="Access Control">
            <p>
              Access to {APP_NAME} is restricted to authorized users.
              Role-based permissions may determine which modules, reports,
              records, notifications and administrative functions an individual
              user is permitted to access.
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
            number="12"
            title="Direct Messaging"
          >
            <p>
              {APP_NAME} may provide direct messaging between authorized
              users for legitimate work-related communication.
            </p>

            <p>
              Direct messages may be stored within the platform and may generate
              a Push notification to the intended recipient when notifications
              are enabled.
            </p>

            <p>
              Users should communicate professionally and should not use the
              messaging function to transmit information that is unnecessary,
              inappropriate, unauthorized or unrelated to legitimate business
              purposes.
            </p>

            <p>
              Users should assume that work-related messages may be retained as
              part of the platform's operational records and may be accessible
              to authorized administrators where required for legitimate
              administrative, security, compliance or troubleshooting purposes.
            </p>
          </PolicySection>

          <PolicySection
            number="13"
            title="Monitoring and System Activity"
          >
            <p>
              For operational integrity, security, troubleshooting, compliance
              and system administration purposes, {APP_NAME} may maintain
              records relating to system access, user activity, notification
              delivery status and platform usage.
            </p>

            <p>
              {APP_NAME} is administered and monitored by{" "}
              <strong>ANapoles Solutions</strong> and/or specifically authorized
              administrators.
            </p>

            <p>
              Monitoring must be conducted for legitimate administrative,
              operational, security or compliance purposes.
            </p>
          </PolicySection>

          <PolicySection number="14" title="Data Security">
            <p>
              Reasonable administrative and technical safeguards are intended
              to protect information against unauthorized access, disclosure,
              alteration, misuse, loss or destruction.
            </p>

            <p>
              Security measures may include authentication, role-based
              permissions, access restrictions, activity records, database
              security controls, device notification registration controls and
              other appropriate safeguards.
            </p>

            <p>
              No electronic system can guarantee absolute security. Users must
              promptly report suspected unauthorized access, compromised
              credentials, data exposure, lost devices with active access or
              other security incidents through the appropriate management or
              administrative channel.
            </p>
          </PolicySection>

          <PolicySection
            number="15"
            title="Data Sharing and Disclosure"
          >
            <p>
              Personal or confidential information contained within {APP_NAME}
              must not be sold, publicly distributed or disclosed to
              unauthorized third parties.
            </p>

            <p>
              Information may be shared when reasonably necessary for
              authorized business operations, when authorized by the
              appropriate organization or data owner, or when disclosure is
              required by applicable law, regulation, legal process or
              governmental authority.
            </p>

            <p>
              Technical service providers used to operate platform features,
              including hosting, database, authentication, storage or
              notification delivery services, may process limited technical
              information as necessary to provide those services.
            </p>
          </PolicySection>

          <PolicySection number="16" title="Data Retention">
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

          <PolicySection number="17" title="User Responsibilities">
            <p>
              By accessing {APP_NAME}, users are responsible for:
            </p>

            <ul>
              <li>Using the platform only for authorized purposes.</li>

              <li>
                Maintaining the confidentiality of information accessed through
                the platform or displayed in mobile notifications.
              </li>

              <li>Protecting their login credentials and personal devices.</li>

              <li>
                Accessing only information required for their assigned
                responsibilities.
              </li>

              <li>
                Refraining from unauthorized copying, disclosure or
                distribution.
              </li>

              <li>
                Signing out when using a shared or temporary device.
              </li>

              <li>
                Reviewing schedules, messages and required operational
                information directly in the platform when appropriate.
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

          <PolicySection number="18" title="Intellectual Property">
            <p>
              Original software, interface organization, workflows, platform
              architecture, documentation, reports, forms, designs and other
              original components developed specifically for {APP_NAME}
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
            number="19"
            title="No Transfer of Ownership Through Access"
          >
            <p>
              Access to {APP_NAME} constitutes permission to use the
              system for authorized purposes. It does not grant the user any
              ownership interest in the platform, source code, proprietary
              workflows, documentation or other protected materials.
            </p>
          </PolicySection>

          <PolicySection number="20" title="Policy Updates">
            <p>
              This policy may be revised as the platform evolves, new
              functionality is introduced, operational requirements change or
              additional privacy, security, legal or compliance requirements
              become applicable.
            </p>

            <p>
              Update {PLATFORM_VERSION} includes expanded mobile capabilities,
              including Home Screen installation, Push notifications, schedule
              notifications, timesheet notifications and direct-message
              notifications.
            </p>

            <p>
              When a new policy version requires acknowledgment, {APP_NAME}
              may require users to review and accept the updated version before
              continuing access.
            </p>
          </PolicySection>

          <PolicySection number="21" title="User Acknowledgment">
            <p>
              Users may be required to acknowledge the current version of this
              policy before accessing {APP_NAME}.
            </p>

            <p>
              The platform may record the policy version and date and time of
              acknowledgment for administrative, security and compliance
              purposes.
            </p>

            <p>
              By acknowledging this version, the user confirms that they
              understand that mobile notifications may be generated when
              enabled, that notification content may appear outside the
              application depending on device settings, and that the user is
              responsible for maintaining the security of their account and
              device.
            </p>

            <div className="privacy-page-warning">
              <strong>
                Unauthorized access, use, reproduction, disclosure or
                distribution of confidential information contained within
                {` ${APP_NAME}`} is prohibited.
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
              {APP_NAME} is created, administered and monitored by{" "}
              ANapoles Solutions.
            </p>

            <span>{APP_COPYRIGHT}</span>
          </div>
        </section>
      </main>

      <footer className="privacy-page-footer">
        <strong>{APP_NAME}</strong>

        <span>{"\u2022"}</span>

        <span>Privacy Policy Version {POLICY_VERSION}</span>

        <span>{"\u2022"}</span>

        <span>Update {PLATFORM_VERSION}</span>

        <span>{"\u2022"}</span>

        <span>{APP_POWERED_BY}</span>
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
