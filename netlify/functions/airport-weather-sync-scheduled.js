const { runAirportWeatherSync } = require("./airport-weather-sync-lib");

exports.handler = async function handler() {
  try {
    const result = await runAirportWeatherSync();
    console.log("Airport Weather scheduled sync:", JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error("Airport Weather scheduled sync failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(error?.message || error) }),
    };
  }
};
