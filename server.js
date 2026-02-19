const express = require("express");
const compression = require("compression");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.PIRATEWEATHER_API_KEY;

if (!apiKey) {
  console.warn(
    "Missing PIRATEWEATHER_API_KEY. Set it in your environment before starting the server."
  );
}

app.use(compression());

app.use((req, res, next) => {
  res.set("Cache-Control", "public, max-age=60");
  next();
});

app.get("/api/forecast", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  const lat = Number.parseFloat(req.query.lat);
  const lon = Number.parseFloat(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "lat and lon are required." });
  }

  const url = new URL(
    `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}`
  );
  url.searchParams.set("exclude", "minutely,alerts");
  url.searchParams.set("units", "us");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({
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

    // Format daily forecast for 7 days (matches api/forecast.js response shape)
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
    return res.status(500).json({ error: "Unable to reach PirateWeather API." });
  }
});

app.use(express.static("public"));

app.listen(port, () => {
  console.log(`ODT Weather listening on port ${port}`);
});
