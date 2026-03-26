// src/utils/parseCabinFlights.js
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
  const lines = text
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

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (ampmMatch) {
    let hh = Number(ampmMatch[1]);
    const mm = ampmMatch[2];
    const ap = ampmMatch[3].toLowerCase();

    if (ap === "pm" && hh !== 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;

    return `${String(hh).padStart(2, "0")}:${mm}`;
  }

  const standardMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (standardMatch) {
    const hh = standardMatch[1].padStart(2, "0");
    const mm = standardMatch[2];
    return `${hh}:${mm}`;
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

function looksLikeTpaDepartureRow(row) {
  return !!(
    row["flight no"] &&
    row["local dep time"] &&
    (row["arr airport code"] || row["published carrier code"])
  );
}

function looksLikeTpaArrivalRow(row) {
  return !!(
    row["flight no"] &&
    (row["local arr time"] || row["eta"] || row["skd eta"]) &&
    (row["dep airport code"] || row["origin"] || row["from"])
  );
}

function inferMovementType(row) {
  if (looksLikeTpaArrivalRow(row)) return "arrival";
  if (looksLikeTpaDepartureRow(row)) return "departure";

  const explicitType = pickFirst(row, [
    "movement type",
    "movement",
    "type",
    "operation type",
  ]).toLowerCase();

  if (explicitType.includes("arrival")) return "arrival";
  if (explicitType.includes("departure")) return "departure";

  const hasArrivalColumns =
    !!pickFirst(row, [
      "skd eta",
      "eta",
      "arrival time",
      "arr time",
      "sta",
      "local arr time",
    ]) || !!pickFirst(row, ["origin", "from", "routing", "dep airport code"]);

  const hasDepartureColumns =
    !!pickFirst(row, [
      "dptr",
      "std",
      "departure time",
      "dep time",
      "local dep time",
    ]) || !!pickFirst(row, ["destination", "dest", "to", "arr airport code"]);

  if (hasArrivalColumns && !hasDepartureColumns) return "arrival";
  if (hasDepartureColumns && !hasArrivalColumns) return "departure";

  return "departure";
}

function getScheduledTime(row, movementType) {
  if (movementType === "arrival") {
    return normalizeTime(
      pickFirst(row, [
        "local arr time",
        "skd eta",
        "eta",
        "arrival time",
        "arr time",
        "sta",
        "time",
      ])
    );
  }

  return normalizeTime(
    pickFirst(row, [
      "local dep time",
      "dptr",
      "std",
      "departure time",
      "dep time",
      "time",
    ])
  );
}

function getRoute(row, movementType) {
  if (movementType === "arrival") {
    return pickFirst(row, [
      "dep airport code",
      "origin",
      "from",
      "routing",
      "route",
      "station",
    ]);
  }

  return pickFirst(row, [
    "arr airport code",
    "destination",
    "dest",
    "to",
    "route",
    "routing",
  ]);
}

function normalizeFlightRow(rawRow) {
  const row = normalizeRowKeys(rawRow);

  if (looksLikeTpaDepartureRow(row)) {
    const airline =
      pickFirst(row, ["published carrier code", "airline", "carrier"]) || "";

    const flightNumberRaw =
      pickFirst(row, ["flight no", "flight number", "flt", "flight"]) || "";

    const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);
    const scheduledTime = normalizeTime(row["local dep time"]);
    const route =
      pickFirst(row, ["arr airport code", "destination", "dest", "to"]) || "";
    const aircraft =
      pickFirst(row, [
        "specific aircraft code",
        "equipment group",
        "aircraft",
        "eqpts",
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
      rawRow,
    };
  }

  if (looksLikeTpaArrivalRow(row)) {
    const airline =
      pickFirst(row, ["published carrier code", "airline", "carrier"]) || "";

    const flightNumberRaw =
      pickFirst(row, ["flight no", "flight number", "flt", "flight"]) || "";

    const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);
    const scheduledTime = normalizeTime(
      pickFirst(row, ["local arr time", "eta", "skd eta"])
    );
    const route =
      pickFirst(row, ["dep airport code", "origin", "from", "routing"]) || "";
    const aircraft =
      pickFirst(row, [
        "specific aircraft code",
        "equipment group",
        "aircraft",
        "eqpts",
      ]) || "";

    if (!scheduledTime) return null;

    return {
      movementType: "arrival",
      airline,
      flightNumber,
      route,
      scheduledTime,
      aircraft,
      gate: "",
      rawRow,
    };
  }

  const movementType = inferMovementType(row);

  const airline = pickFirst(row, [
    "published carrier code",
    "airline",
    "carrier",
    "al",
    "code",
  ]);

  const flightNumberRaw = pickFirst(row, [
    "flight no",
    "flight number",
    "flt",
    "flight",
    "flt no",
  ]);

  const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);
  const scheduledTime = getScheduledTime(row, movementType);
  const route = getRoute(row, movementType);

  const aircraft = pickFirst(row, [
    "specific aircraft code",
    "equipment group",
    "a/c",
    "ac",
    "aircraft",
    "eqpts",
    "equipment",
  ]);

  const gate = pickFirst(row, [
    "gate",
    "to gate",
    "from gate",
  ]);

  if (!flightNumber && !scheduledTime && !route) return null;
  if (!scheduledTime) return null;

  return {
    movementType,
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

  if (a.movementType !== b.movementType) {
    return a.movementType.localeCompare(b.movementType);
  }

  return (a.flightNumber || "").localeCompare(b.flightNumber || "");
}

async function parseCsvFile(file) {
  const text = await file.text();
  return parseCsvText(text);
}

async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.push(...jsonRows);
  }

  return rows;
}

function textLinesToRows(lines) {
  const rows = [];

  for (const line of lines) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    const match = clean.match(/(\d{3,4})\s+(\d{3,4})\s+(\d{3,4})\s+(\d{3,4})/);
    if (!match) continue;

    const flight = match[1];
    const timeRaw = match[3];

    rows.push({
      FLT: flight,
      DPTR: timeRaw,
      Route: "UNKNOWN",
    });
  }

  return rows;
}

async function parsePdfFile(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const lines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    const splitLines = pageText
      .split(/(?=(?:\d{3,4}\s+\d{3,4}\s+\d{3,4}\s+\d{3,4}))/g)
      .map((s) => s.trim())
      .filter(Boolean);

    lines.push(...splitLines);
  }

  return textLinesToRows(lines);
}

export async function parseCabinFlights(file) {
  const fileName = file?.name?.toLowerCase() || "";

  let rows = [];

  if (fileName.endsWith(".csv")) {
    rows = await parseCsvFile(file);
  } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    rows = await parseExcelFile(file);
  } else if (fileName.endsWith(".pdf")) {
    rows = await parsePdfFile(file);
  } else {
    throw new Error("Unsupported file type. Use CSV, Excel, or PDF.");
  }

  const flights = rows
    .map(normalizeFlightRow)
    .filter(Boolean)
    .sort(sortFlights);

  console.log("RAW ROWS:", rows);
  console.log("PARSED FLIGHTS:", flights);

  if (!flights.length) {
    throw new Error(
      "No flights were detected in the file. Check the column names or file layout."
    );
  }

  return flights;
}
