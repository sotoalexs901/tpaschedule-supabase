// src/platform/api.js
// Central URL resolver for AeroStation Hub backend calls.
//
// Website/PWA:
//   /.netlify/functions/... stays same-origin.
//
// iOS/Android:
//   relative Netlify Function calls are automatically routed to
//   https://www.aerostationhub.com unless VITE_API_BASE_URL overrides it.

import { isNativeApp } from "./platform.js";

const DEFAULT_NATIVE_API_BASE_URL = "https://www.aerostationhub.com";

const configuredBaseUrl = String(
  import.meta.env.VITE_API_BASE_URL || ""
).trim();

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  if (!isNativeApp()) return "";

  return trimTrailingSlashes(
    configuredBaseUrl || DEFAULT_NATIVE_API_BASE_URL
  );
}

export function getFunctionUrl(functionName) {
  const cleanName = String(functionName || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^\.netlify\/functions\//, "");

  if (!cleanName) {
    throw new Error("A Netlify Function name is required.");
  }

  return `${getApiBaseUrl()}/.netlify/functions/${cleanName}`;
}

export function resolveApiUrl(url) {
  const value = String(url || "").trim();
  if (!value) return value;

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith("/.netlify/functions/")) {
    const functionName = value.slice("/.netlify/functions/".length);
    return getFunctionUrl(functionName);
  }

  if (!isNativeApp()) return value;

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return value;

  return `${baseUrl}/${value.replace(/^\/+/, "")}`;
}

export function apiFetch(url, options) {
  return fetch(resolveApiUrl(url), options);
}
