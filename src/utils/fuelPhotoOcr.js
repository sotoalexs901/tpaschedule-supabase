// src/utils/fuelPhotoOcr.js

function safeText(v) {
  return String(v || "").trim();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNumericText(value) {
  return String(value || "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumbersFromText(text) {
  const normalized = normalizeNumericText(text);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .map((item) => safeNumber(item))
    .filter((item) => item !== null);
}

function findClosestNumber(target, candidates, tolerance = 5) {
  const numericTarget = safeNumber(target);
  if (numericTarget === null || !Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const diff = Math.abs(candidate - numericTarget);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  if (best === null) return null;
  if (bestDiff > tolerance) return null;

  return {
    value: best,
    diff: bestDiff,
  };
}

export function compareFuelPhotoReadings({
  startReading,
  endReading,
  rawText,
  tolerance = 5,
}) {
  const numbers = extractNumbersFromText(rawText);

  const startMatch = findClosestNumber(startReading, numbers, tolerance);
  const endMatch = findClosestNumber(endReading, numbers, tolerance);

  let status = "pending_review";

  if (startMatch && endMatch) {
    status = "match";
  } else if (!startMatch && !endMatch) {
    status = "mismatch";
  }

  return {
    status,
    numbersDetected: numbers,
    matchedStart: startMatch?.value ?? null,
    matchedEnd: endMatch?.value ?? null,
    startDiff: startMatch?.diff ?? null,
    endDiff: endMatch?.diff ?? null,
    rawText: safeText(rawText),
  };
}

export async function runFuelPhotoOcr(imageUrl) {
  const ocrUrl = import.meta.env.VITE_FUEL_OCR_URL;

  if (!ocrUrl) {
    throw new Error(
      "Missing VITE_FUEL_OCR_URL. Configure your OCR endpoint first."
    );
  }

  const response = await fetch(ocrUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      document_type: "fuel_meter",
    }),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`OCR failed (${response.status}). ${txt}`.trim());
  }

  const result = await response.json();

  return {
    rawText: String(
      result?.raw_text ||
        result?.ocr_text ||
        result?.text ||
        result?.full_text ||
        ""
    ),
    providerResult: result,
  };
}
