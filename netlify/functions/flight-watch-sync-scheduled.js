const { runFlightWatchSync } = require("./flight-watch-sync-lib");

exports.handler = async function handler() {
  try {
    const result = await runFlightWatchSync();
    console.log("Flight Watch scheduled sync:", JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error("Flight Watch scheduled sync failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error?.message || error) }) };
  }
};
