// Shared Resend account, isolated AeroStation Hub sender configuration.
// This function is disabled until server-verified Station Manager auth is wired.
// Never accept a client-provided sender address or arbitrary recipient.
const TEST_RECIPIENT = "alexs.napoles90@gmail.com";
exports.handler = async (event) => {
  const json = (statusCode, data) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(data) });
  if (event.httpMethod !== "POST") return json(405, { error: "POST required." });
  if (process.env.AEROSTATION_INVITES_ENABLED !== "true") return json(503, { error: "Employee invitations are not enabled." });
  // Deliberately fail closed until verified administrative sessions are integrated.
  // The existing PIN/localStorage login cannot authorize an email-sending endpoint.
  return json(503, { error: "Verified admin authentication is required before sending invitations.", testRecipient: TEST_RECIPIENT });
};
