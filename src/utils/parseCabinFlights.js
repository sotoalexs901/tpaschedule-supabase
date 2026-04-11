import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsvText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function normalizeHeaderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._-]+/g, " ");
}

function normalizeRowKeys(row) {
  const normalized = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeaderName(key)] = value;
  });

  return normalized;
}

function pickFirst(row, keys) {
  for (const key of keys) {
    const normalizedKey = normalizeHeaderName(key);
    const value = row[normalizedKey];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeTime(value) {
  if (!value) return "";

  const raw = String(value).trim();

  const standardMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (standardMatch) {
    const hh = standardMatch[1].padStart(2, "0");
    const mm = standardMatch[2];
    return `${hh}:${mm}`;
  }

  const ampmMatch = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hh = Number(ampmMatch[1]);
    const mm = String(ampmMatch[2] || "00").padStart(2, "0");
    const suffix = ampmMatch[3].toUpperCase();

    if (suffix === "PM" && hh < 12) hh += 12;
    if (suffix === "AM" && hh === 12) hh = 0;

    return `${String(hh).padStart(2, "0")}:${mm}`;
  }

  const onlyDigits = raw.replace(/\D/g, "");

  if (onlyDigits.length === 3) {
    return `0${onlyDigits[0]}:${onlyDigits.slice(1)}`;
  }

  if (onlyDigits.length === 4) {
    return `${onlyDigits.slice(0, 2)}:${onlyDigits.slice(2)}`;
  }

  return "";
}

function normalizeFlightNumber(value, airline) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (airline && !raw.toLowerCase().startsWith(String(airline).toLowerCase())) {
    return `${airline}${raw}`;
  }

  return raw;
}

function sortFlights(a, b) {
  if (a.scheduledTime !== b.scheduledTime) {
    return a.scheduledTime.localeCompare(b.scheduledTime);
  }

  return (a.flightNumber || "").localeCompare(b.flightNumber || "");
}

function normalizeFlightRow(rawRow) {
  const row = normalizeRowKeys(rawRow);

  const airline =
    pickFirst(row, [
      "published carrier code",
      "airline",
      "carrier",
      "carrier code",
    ]) || "";

  const flightNumberRaw =
    pickFirst(row, [
      "flight no",
      "flight number",
      "flt",
      "flight",
      "flt no",
    ]) || "";

  const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);

  const scheduledTime = normalizeTime(
    pickFirst(row, [
      "local dep time",
      "dptr",
      "std",
      "departure time",
      "time",
    ])
  );

  const route =
    pickFirst(row, [
      "arr airport code",
      "destination",
      "dest",
      "to",
      "route",
    ]) || "";

  const aircraft =
    pickFirst(row, [
      "specific aircraft code",
      "equipment group",
      "aircraft",
      "eqpts",
      "equipment",
    ]) || "";

  if (!scheduledTime) return null;

  return {
    movementType: "departure",
    airline,
    flightNumber,
    route,
    scheduledTime,
    aircraft,
    gate: "",
    rawText: JSON.stringify(rawRow),
  };
}

function extractPdfTextItems(textContent) {
  return (textContent?.items || [])
    .map((item) => String(item?.str || "").trim())
    .filter(Boolean);
}

function buildPdfLines(items) {
  const lines = [];
  let current = [];

  items.forEach((item) => {
    if (/^\d{1,2}:\d{2}$/.test(item) && current.length > 0) {
      lines.push(current.join(" "));
      current = [item];
      return;
    }

    current.push(item);
  });

  if (current.length > 0) {
    lines.push(current.join(" "));
  }

  return lines;
}

function parsePdfLineToFlight(line) {
  const clean = String(line || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const timeMatch = clean.match(/\b(\d{1,2}:\d{2})\b/);
  if (!timeMatch) return null;

  const scheduledTime = normalizeTime(timeMatch[1]);
  if (!scheduledTime) return null;

  const flightMatch = clean.match(/\b([A-Z]{2,3})\s?(\d{2,4})\b/);
  const airline = flightMatch ? flightMatch[1] : "";
  const flightNumber = flightMatch
    ? normalizeFlightNumber(flightMatch[2], airline)
    : "";

  const airportMatch = clean.match(/\b([A-Z]{3})\b(?!.*\b[A-Z]{3}\b.*\b[A-Z]{3}\b)/);
  const route = airportMatch ? airportMatch[1] : "";

  const aircraftMatch = clean.match(/\b(32B|320|321|319|738|739|73G|73H|E75|E90|CRJ|757|767|330|350)\b/i);
  const aircraft = aircraftMatch ? aircraftMatch[1].toUpperCase() : "";

  return {
    movementType: "departure",
    airline,
    flightNumber,
    route,
    scheduledTime,
    aircraft,
    gate: "",
    rawText: clean,
  };
}

async function parsePdfFlights(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allItems = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    allItems.push(...extractPdfTextItems(textContent));
  }

  const lines = buildPdfLines(allItems);

  const flights = lines
    .map(parsePdfLineToFlight)
    .filter(Boolean)
    .sort(sortFlights);

  if (!flights.length) {
    throw new Error(
      "No flights were detected in the PDF. Check that the PDF contains readable text and not only an image."
    );
  }

  return flights;
}

export async function parseCabinFlights(file) {
  const fileName = file?.name?.toLowerCase() || "";

  if (fileName.endsWith(".csv")) {
    const text = await file.text();
    const rows = parseCsvText(text);

    const flights = rows
      .map(normalizeFlightRow)
      .filter(Boolean)
      .sort(sortFlights);

    if (!flights.length) {
      throw new Error(
        "No flights were detected in the CSV. Check the column names."
      );
    }

    return flights;
  }

  if (fileName.endsWith(".pdf")) {
    return await parsePdfFlights(file);
  }

  throw new Error("Only CSV and PDF files are supported.");
}
