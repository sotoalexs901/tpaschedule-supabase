// src/utils/parseCabinFlights.js

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

function normalizeTime(value) {
  if (!value) return "";

  const raw = String(value).trim();

  // 7:06 -> 07:06
  const matchStandard = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (matchStandard) {
    const hh = matchStandard[1].padStart(2, "0");
    const mm = matchStandard[2];
    return `${hh}:${mm}`;
  }

  // 706 -> 07:06 / 1530 -> 15:30
  const onlyDigits = raw.replace(/\D/g, "");
  if (onlyDigits.length === 3) {
    return `0${onlyDigits[0]}:${onlyDigits.slice(1)}`;
  }
  if (onlyDigits.length === 4) {
    return `${onlyDigits.slice(0, 2)}:${onlyDigits.slice(2)}`;
  }

  return raw;
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

function normalizeFlightRow(row) {
  const flightNumber = pickFirst(row, [
    "FLT",
    "Flight",
    "Flight Number",
    "flight",
    "flight_number",
  ]);

  const scheduledTime = normalizeTime(
    pickFirst(row, [
      "DPTR",
      "Departure",
      "Departure Time",
      "STD",
      "Time",
      "time",
    ])
  );

  const route = pickFirst(row, [
    "ROUTE",
    "Route",
    "DEST",
    "Destination",
    "To",
    "to",
  ]);

  const aircraft = pickFirst(row, [
    "A/C",
    "Aircraft",
    "EQPTS",
    "Equipment",
    "equipment",
  ]);

  const gate = pickFirst(row, [
    "Gate",
    "GATE",
    "gate",
  ]);

  const airline = pickFirst(row, [
    "Airline",
    "AIRLINE",
    "carrier",
  ]);

  if (!flightNumber && !scheduledTime) return null;

  return {
    movementType: "departure",
    airline,
    flightNumber,
    route,
    scheduledTime,
    aircraft,
    gate,
    rawRow: row,
  };
}

export async function parseCabinFlights(file) {
  const fileName = file?.name?.toLowerCase() || "";

  if (!fileName.endsWith(".csv")) {
    throw new Error("Por ahora este MVP solo soporta archivos CSV.");
  }

  const text = await file.text();
  const rows = parseCsvText(text);

  return rows
    .map(normalizeFlightRow)
    .filter(Boolean)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}
