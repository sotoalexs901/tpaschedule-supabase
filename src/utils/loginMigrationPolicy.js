/**
 * Dual-login migration policy for AeroStation Hub.
 *
 * Configure VITE_EMAIL_LOGIN_ROLLOUT_AT with an ISO-8601 UTC timestamp when
 * the verified email/password login is deployed to production.
 * Never start the 10-day clock during preview development.
 *
 * NOTE: This is a UI policy only. Server-side PIN authorization must enforce
 * the same deadline before PIN login can be retired securely.
 */
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export function getLoginMigrationState(now = Date.now()) {
  const raw = import.meta.env.VITE_EMAIL_LOGIN_ROLLOUT_AT;
  const startedAt = raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(startedAt)) return {
    configured: false, emailEnabled: false, pinEnabled: true,
    expiresAt: null, daysRemaining: null,
  };
  const expiresAt = startedAt + TEN_DAYS_MS;
  return {
    configured: true,
    emailEnabled: import.meta.env.VITE_EMAIL_LOGIN_ENABLED === "true",
    pinEnabled: now < expiresAt,
    expiresAt: new Date(expiresAt).toISOString(),
    daysRemaining: Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))),
  };
}
