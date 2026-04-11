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

  const digitsOnly = raw.replace(/\D/g, "");

  if (digitsOnly.length === 3) {
    return `0${digitsOnly[0]}:${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.length === 4) {
    return `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
  }

  const ampmMatch = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hh = Number(ampmMatch[1]);
    const mm = String(ampmMatch[2] || "00").padStart(2, "0");
    const meridian = ampmMatch[3].toLowerCase();

    if (meridian === "pm" && hh < 12) hh += 12;
    if (meridian === "am" && hh === 12) hh = 0;

    return `${String(hh).padStart(2, "0")}:${mm}`;
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
      "sched time",
      "scheduled time",
    ])
  );

  const route =
    pickFirst(row, [
      "arr airport code",
      "destination",
      "dest",
      "to",
      "arrival airport code",
    ]) || "";

  const aircraft =
    pickFirst(row, [
      "specific aircraft code",
      "equipment group",
      "aircraft",
      "eqpts",
      "equipment",
    ]) || "";

  const gate =
    pickFirst(row, ["gate", "gate number", "departure gate"]) || "";

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

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => item?.str || "")
      .join(" ");

    fullText += `\n${pageText}`;
  }

  return fullText;
}

function parsePdfLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseFlightLineFromPdf(line) {
  const clean = String(line || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const timeMatch = clean.match(/\b(\d{1,2}:\d{2})\b/);
  if (!timeMatch) return null;

  const flightMatch = clean.match(/\b([A-Z]{2,3}\s?\d{2,4})\b/);
  if (!flightMatch) return null;

  const routeMatch = clean.match(/\b([A-Z]{3}\s*-\s*[A-Z]{3})\b/);
  const aircraftMatch = clean.match(/\b(A\d{3}|B\d{3}|E\d{3}|CRJ\d{3}|AT\d{2}|DH\d{2}|B7\d{2}|A22\d)\b/i);
  const gateMatch = clean.match(/\b([A-Z]\d{1,2})\b/);

  const rawFlight = String(flightMatch[1] || "").replace(/\s+/g, "");
  const airline = rawFlight.match(/^[A-Z]{2,3}/)?.[0] || "";
  const numberOnly = rawFlight.slice(airline.length);

  return {
    movementType: /arrival/i.test(clean) ? "arrival" : "departure",
    airline,
    flightNumber: normalizeFlightNumber(numberOnly, airline),
    route: routeMatch ? routeMatch[1].replace(/\s+/g, "") : "",
    scheduledTime: normalizeTime(timeMatch[1]),
    aircraft: aircraftMatch ? aircraftMatch[1].toUpperCase() : "",
    gate: gateMatch ? gateMatch[1].toUpperCase() : "",
    rawText: clean,
  };
}

function parseFlightsFromPdfText(text) {
  const lines = parsePdfLines(text);

  const flights = lines
    .map(parseFlightLineFromPdf)
    .filter(Boolean)
    .sort(sortFlights);

  return flights;
}

export async function parseCabinFlights(file) {
  const fileName = String(file?.name || "").toLowerCase();
  const fileType = String(file?.type || "").toLowerCase();

  const isPdf =
    fileType.includes("pdf") || fileName.endsWith(".pdf");

  if (isPdf) {
    const pdfText = await extractPdfText(file);
    const flights = parseFlightsFromPdfText(pdfText);

    console.log("PDF TEXT:", pdfText);
    console.log("PARSED PDF FLIGHTS:", flights);

    if (!flights.length) {
      throw new Error(
        "No flights were detected in the PDF. Verify that the PDF contains selectable text and flight rows."
      );
    }

    return flights;
  }

  if (!fileName.endsWith(".csv")) {
    throw new Error("Only CSV and PDF files are supported.");
  }

  const text = await file.text();
  const rows = parseCsvText(text);

  const flights = rows
    .map(normalizeFlightRow)
    .filter(Boolean)
    .sort(sortFlights);

  console.log("RAW ROWS:", rows);
  console.log("PARSED FLIGHTS:", flights);

  if (!flights.length) {
    throw new Error(
      "No flights were detected in the file. Check the CSV column names."
    );
  }

  return flights;
}
