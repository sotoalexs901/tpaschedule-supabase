const fs = require("fs");
const path = require("path");

function pad(value) {
  return String(value).padStart(2, "0");
}

const now = new Date();

const version = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
  "-",
  pad(now.getHours()),
  pad(now.getMinutes()),
  pad(now.getSeconds()),
].join("");

const payload = {
  version,
  generatedAt: now.toISOString(),
};

const publicDir = path.join(__dirname, "..", "public");
const outputFile = path.join(publicDir, "version.json");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), "utf8");

console.log(`version.json updated: ${version}`);
