require("dotenv").config();

module.exports = async function handler(req, res) {
  const apiKey = process.env.PIRATEWEATHER_API_KEY;

  if (!apiKey) {
    res.statusCode = 500;
    return res.json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  const lat = Number.parseFloat(req.query.lat);
  const lon = Number.parseFloat(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.statusCode = 400;
    return res.json({ error: "lat and lon are required." });
  }

  const url = new URL(
    `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}`
  );
  url.searchParams.set("exclude", "minutely,alerts");
  url.searchParams.set("units", "us");

  res.setHeader("Cache-Control", "public, max-age=43200"); // 12 hours

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.statusCode = response.status;
      return res.json({
        error: "PirateWeather API error",
        status: response.status
      });
    }

    const data = await response.json();
    const currently = data.currently || {};
    const dailyData = data.daily?.data || [];
    const hourlyData = data.hourly?.data || [];

    // Extract API usage from response headers
    const apiCalls = response.headers.get("x-forecast-api-calls");
    const rateLimit = response.headers.get("ratelimit-limit");
    const rateRemaining = response.headers.get("ratelimit-remaining");

    // Format daily forecast for 7 days
    const daily = dailyData.slice(0, 7).map((day) => ({
      time: day.time,
      high: day.temperatureHigh,
      low: day.temperatureLow,
      icon: day.icon || "",
      summary: day.summary || ""
    }));

    // Format hourly forecast for 96 hours (4 days)
    const hourly = hourlyData.slice(0, 96).map((h) => ({
      time: h.time,
      icon: h.icon || "",
      temp: h.temperature,
      precipProbability: h.precipProbability || 0,
      precipIntensity: h.precipIntensity || 0,
      precipType: h.precipType || "none",
      windSpeed: h.windSpeed || 0,
      summary: h.summary || ""
    }));

    return res.json({
      time: currently.time,
      summary: currently.summary,
      icon: currently.icon,
      temperature: currently.temperature,
      apparentTemperature: currently.apparentTemperature,
      windSpeed: currently.windSpeed,
      windGust: currently.windGust,
      humidity: currently.humidity,
      daily,
      hourly,
      _usage: {
        calls: apiCalls ? parseInt(apiCalls, 10) : null,
        limit: rateLimit ? parseInt(rateLimit, 10) : null,
        remaining: rateRemaining ? parseInt(rateRemaining, 10) : null
      }
    });
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    return res.json({ error: "Unable to reach PirateWeather API." });
  }
};
