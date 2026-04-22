// src/utils/fuelPhotoOcr.js

function safeText(v) {
  return String(v || "").trim();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  const n = safeNumber(value);
  if (n === null) return null;
  return Number(n.toFixed(2));
}

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[IiLl]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[,]/g, ".")
    .replace(/[^\d.\n\r\t :_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyBadNumber(value) {
  const n = safeNumber(value);
  if (n === null) return true;

  // números muy pequeños o absurdamente grandes
  if (n < 1) return true;
  if (n > 999999) return true;

  return false;
}

function hasReasonableDecimalPrecision(raw) {
  const text = String(raw || "").trim();
  if (!text.includes(".")) return true;

  const [, decimals = ""] = text.split(".");
  return decimals.length <= 2;
}

function extractNumberCandidates(rawText) {
  const text = normalizeOcrText(rawText);
  if (!text) return [];

  const regex = /\d+(?:\.\d{1,2})?/g;
  const matches = [...text.matchAll(regex)];

  const candidates = matches
    .map((match, index) => {
      const raw = match[0];
      const value = round2(raw);
      const start = match.index || 0;

      return {
        id: `${index}-${start}-${raw}`,
        raw,
        value,
        start,
      };
    })
    .filter((item) => item.value !== null)
    .filter((item) => !isLikelyBadNumber(item.value))
    .filter((item) => hasReasonableDecimalPrecision(item.raw));

  // deduplicar por posición + valor
  const seen = new Set();
  return candidates.filter((item) => {
    const key = `${item.start}-${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreCandidate(target, candidate, tolerance) {
  const numericTarget = safeNumber(target);
  if (numericTarget === null || !candidate) return null;

  const diff = Math.abs(candidate.value - numericTarget);
  if (diff > tolerance) return null;

  let score = 100 - diff * 10;

  // bonus si coincide exacto
  if (diff === 0) score += 20;

  // bonus si ambos tienen decimal parecido
  if (String(candidate.raw).includes(".") && String(target).includes(".")) {
    score += 5;
  }

  return {
    ...candidate,
    diff: round2(diff),
    score,
  };
}

function sortBestMatches(matches) {
  return [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.diff !== b.diff) return a.diff - b.diff;
    return a.value - b.value;
  });
}

function findBestCandidate(target, candidates, tolerance = 5, excludeIds = []) {
  const excludeSet = new Set(excludeIds);

  const scored = candidates
    .filter((item) => !excludeSet.has(item.id))
    .map((item) => scoreCandidate(target, item, tolerance))
    .filter(Boolean);

  const sorted = sortBestMatches(scored);
  return sorted[0] || null;
}

function classifyStatus({ target, match, tolerance }) {
  const numericTarget = safeNumber(target);
  if (numericTarget === null) return "missing_target";
  if (!match) return "mismatch";
  if (match.diff === 0) return "match";
  if (match.diff <= Math.min(1, tolerance)) return "near_match";
  return "pending_review";
}

export function compareSingleFuelReading({
  reading,
  rawText,
  tolerance = 5,
}) {
  const candidates = extractNumberCandidates(rawText);
  const bestMatch = findBestCandidate(reading, candidates, tolerance);

  const status = classifyStatus({
    target: reading,
    match: bestMatch,
    tolerance,
  });

  return {
    status,
    numbersDetected: candidates.map((item) => item.value),
    matchedValue: bestMatch?.value ?? null,
    diff: bestMatch?.diff ?? null,
    confidenceScore: bestMatch?.score ?? 0,
    rawText: safeText(rawText),
  };
}

export function compareFuelPhotoReadings({
  startReading,
  endReading,
  rawText,
  tolerance = 5,
}) {
  const candidates = extractNumberCandidates(rawText);

  const startMatch = findBestCandidate(startReading, candidates, tolerance);
  const endMatch = findBestCandidate(
    endReading,
    candidates,
    tolerance,
    startMatch ? [startMatch.id] : []
  );

  const startStatus = classifyStatus({
    target: startReading,
    match: startMatch,
    tolerance,
  });

  const endStatus = classifyStatus({
    target: endReading,
    match: endMatch,
    tolerance,
  });

  let status = "pending_review";

  if (
    (startStatus === "match" || startStatus === "near_match") &&
    (endStatus === "match" || endStatus === "near_match")
  ) {
    status = "match";
  } else if (startStatus === "mismatch" && endStatus === "mismatch") {
    status = "mismatch";
  }

  // si ambos usaron el mismo valor real, obligar review
  if (
    startMatch &&
    endMatch &&
    startMatch.value === endMatch.value &&
    safeNumber(startReading) !== safeNumber(endReading)
  ) {
    status = "pending_review";
  }

  return {
    status,
    startStatus,
    endStatus,
    numbersDetected: candidates.map((item) => item.value),
    matchedStart: startMatch?.value ?? null,
    matchedEnd: endMatch?.value ?? null,
    startDiff: startMatch?.diff ?? null,
    endDiff: endMatch?.diff ?? null,
    startConfidenceScore: startMatch?.score ?? 0,
    endConfidenceScore: endMatch?.score ?? 0,
    rawText: safeText(rawText),
  };
}

export async function runFuelPhotoOcr(imageUrl, extraPayload = {}) {
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
      ...extraPayload,
    }),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`OCR failed (${response.status}). ${txt}`.trim());
  }

  const result = await response.json();

  const rawText = String(
    result?.raw_text ||
      result?.ocr_text ||
      result?.text ||
      result?.full_text ||
      result?.rawText ||
      ""
  );

  return {
    rawText,
    normalizedText: normalizeOcrText(rawText),
    extractedNumbers: extractNumberCandidates(rawText).map((item) => item.value),
    providerResult: result,
  };
}
