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

  const ampmMatch = raw.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = String(ampmMatch[2] || "00").padStart(2, "0");
    const meridian = ampmMatch[3].toLowerCase();

    if (meridian === "pm" && hour < 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${minute}`;
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

  if (
    airline &&
    !raw.toLowerCase().startsWith(String(airline).toLowerCase())
  ) {
    return `${airline}${raw}`;
  }

  return raw;
}

function normalizeFlightRow(rawRow) {
  const row = normalizeRowKeys(rawRow);

  const airline =
    pickFirst(row, ["published carrier code", "airline", "carrier"]) || "";

  const flightNumberRaw =
    pickFirst(row, ["flight no", "flight number", "flt", "flight"]) || "";

  const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);

  const scheduledTime = normalizeTime(
    pickFirst(row, [
      "local dep time",
      "departure time",
      "dep time",
      "dptr",
      "std",
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

  const gate = pickFirst(row, ["gate"]) || "";

  if (!scheduledTime) return null;

  return {
    movementType: "departure",
    airline,
    flightNumber,
    route,
    scheduledTime,
    aircraft,
    gate,
    rawRow,
  };
}

function sortFlights(a, b) {
  if (a.scheduledTime !== b.scheduledTime) {
    return a.scheduledTime.localeCompare(b.scheduledTime);
  }

  return (a.flightNumber || "").localeCompare(b.flightNumber || "");
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += `\n${pageText}`;
  }

  return fullText;
}

function parseFlightsFromPdfText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const flights = [];

  for (const line of lines) {
    const timeMatch = line.match(/\b(\d{1,2}:\d{2}|\d{3,4})\b/);
    const flightMatch = line.match(/\b([A-Z]{1,3}\s?\d{2,4})\b/);
    const routeMatch = line.match(/\b([A-Z]{3})\b(?:\s*-\s*|\s+)([A-Z]{3})\b/);
    const aircraftMatch = line.match(
      /\b(320|321|319|73G|738|739|7M8|E75|E70|CRJ|757|767|777|787|330|350)\b/i
    );

    if (!timeMatch) continue;

    const scheduledTime = normalizeTime(timeMatch[1]);
    if (!scheduledTime) continue;

    const flightNumber = flightMatch ? flightMatch[1].replace(/\s+/g, "") : "";
    const route = routeMatch ? `${routeMatch[1]}-${routeMatch[2]}` : "";
    const aircraft = aircraftMatch ? aircraftMatch[1].toUpperCase() : "";

    flights.push({
      movementType: "departure",
      airline: "",
      flightNumber,
      route,
      scheduledTime,
      aircraft,
      gate: "",
      rawText: line,
    });
  }

  return flights.sort(sortFlights);
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
        "No flights were detected in the CSV file. Check the column names."
      );
    }

    return flights;
  }

  if (fileName.endsWith(".pdf")) {
    const text = await extractTextFromPdf(file);
    const flights = parseFlightsFromPdfText(text);

    if (!flights.length) {
      throw new Error(
        "No flights were detected in the PDF file. Verify the PDF has selectable text."
      );
    }

    return flights;
  }

  throw new Error("Only CSV and PDF files are supported.");
}
