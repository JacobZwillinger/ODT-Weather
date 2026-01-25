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
  url.searchParams.set("exclude", "minutely,hourly,alerts");
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
    const daily = Array.isArray(data?.daily?.data)
      ? data.daily.data.slice(0, 8).map((day) => ({
          time: day.time,
          summary: day.summary,
          icon: day.icon,
          temperatureHigh: day.temperatureHigh,
          temperatureLow: day.temperatureLow,
          precipProbability: day.precipProbability,
          precipAccumulation: day.precipAccumulation
        }))
      : [];

    return res.json({
      timeZone: data.timezone,
      updatedTime: data.currently?.time,
      daily
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
