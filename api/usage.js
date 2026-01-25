require("dotenv").config();

module.exports = async function handler(req, res) {
  const apiKey = process.env.PIRATEWEATHER_API_KEY;

  if (!apiKey) {
    res.statusCode = 500;
    return res.json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  // Make a minimal API call to get usage headers
  // Using Bend, OR as a fixed location
  const url = new URL(
    `https://api.pirateweather.net/forecast/${apiKey}/44.0582,-121.3153`
  );
  url.searchParams.set("exclude", "minutely,hourly,daily,alerts");
  url.searchParams.set("units", "us");

  res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 min

  try {
    const response = await fetch(url);

    // Extract usage headers
    const apiCalls = response.headers.get("x-forecast-api-calls");
    const responseTime = response.headers.get("x-response-time");

    return res.json({
      apiCalls: apiCalls ? parseInt(apiCalls, 10) : null,
      responseTime: responseTime || null
    });
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    return res.json({ error: "Unable to check API usage." });
  }
};
