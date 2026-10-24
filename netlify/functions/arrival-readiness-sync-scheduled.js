const { runArrivalReadinessSync } = require("./arrival-readiness-sync-lib");

exports.handler = async function handler() {
  try {
    const result = await runArrivalReadinessSync();
    console.log("Arrival Readiness scheduled sync:", JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error("Arrival Readiness scheduled sync failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error?.message || error) }) };
  }
};
