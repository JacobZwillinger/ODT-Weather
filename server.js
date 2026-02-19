const express = require("express");
const compression = require("compression");
require("dotenv").config();
const {
  parseLatLonQuery,
  fetchForecast,
  fetchUsage
} = require("./lib/pirateweather");

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

  const coords = parseLatLonQuery(req.query);
  if (!coords.ok) {
    return res.status(coords.status).json({ error: coords.error });
  }

  const result = await fetchForecast({
    apiKey,
    lat: coords.lat,
    lon: coords.lon
  });
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }

  return res.json(result.body);
});

app.get("/api/usage", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  const result = await fetchUsage({ apiKey });
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }

  return res.json(result.body);
});

app.use(express.static("public"));

app.listen(port, () => {
  console.log(`ODT Weather listening on port ${port}`);
});
