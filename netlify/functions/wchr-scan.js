export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { image_url } = JSON.parse(event.body || "{}");
    if (!image_url) {
      return { statusCode: 400, body: "Missing image_url" };
    }

    // Respuesta temporal (STUB)
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passenger_name: "TEST / PASSENGER",
        airline: "WL",
        flight_number: "294",
        flight_date: "2026-01-08",
        origin: "TPA",
        destination: "SNU",
        seat: "19A",
        gate: "F88",
        pnr: "QN5UN9",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
}
