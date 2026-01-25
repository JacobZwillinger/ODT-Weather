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
  url.searchParams.set("exclude", "minutely,hourly,alerts");
  url.searchParams.set("units", "us");

  res.setHeader("Cache-Control", "public, max-age=60");

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
    res.statusCode = 500;
    return res.json({ error: "Unable to reach PirateWeather API." });
  }
};
