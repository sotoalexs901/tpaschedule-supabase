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

function normalizeFlightRow(rawRow) {
  const row = normalizeRowKeys(rawRow);

  const airline =
    pickFirst(row, ["published carrier code", "airline", "carrier"]) || "";

  const flightNumberRaw =
    pickFirst(row, ["flight no", "flight number", "flt", "flight"]) || "";

  const flightNumber = normalizeFlightNumber(flightNumberRaw, airline);

  const scheduledTime = normalizeTime(
    pickFirst(row, ["local dep time", "dptr", "std", "departure time"])
  );

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

function sortFlights(a, b) {
  if (a.scheduledTime !== b.scheduledTime) {
    return a.scheduledTime.localeCompare(b.scheduledTime);
  }

  return (a.flightNumber || "").localeCompare(b.flightNumber || "");
}

export async function parseCabinFlights(file) {
  const fileName = file?.name?.toLowerCase() || "";

  if (!fileName.endsWith(".csv")) {
    throw new Error("For now, this version only supports CSV files.");
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
