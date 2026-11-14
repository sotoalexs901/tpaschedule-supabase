import { getAuth } from "firebase/auth";
import { app } from "../firebase";

const ENDPOINT = "/.netlify/functions/operational-chat";

/**
 * Requires a real Firebase Auth session. The existing station PIN/localStorage
 * session is NOT accepted as an authorization credential.
 */
export async function operationalChatRequest(action, payload = {}) {
  const account = getAuth(app).currentUser;
  if (!account) throw new Error("Secure chat sign-in is not configured for this employee.");
  const token = await account.getIdToken();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Operational Chat is unavailable.");
  return result;
}
