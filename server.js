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

// Skip compression for .pmtiles files. PMTiles is read via HTTP Range requests
// and gzip'ing the response body breaks the byte-offset math, producing
// ERR_CONTENT_DECODING_FAILED in the browser. Also skip whenever the client
// sends a Range header for the same reason.
app.use(compression({
  filter: (req, res) => {
    if (req.path.endsWith('.pmtiles')) return false;
    if (req.headers.range) return false;
    return compression.filter(req, res);
  }
}));

app.use((req, res, next) => {
  // No caching for JS/CSS so edits reflect immediately during development
  if (req.path.match(/\.(js|css|html)$/) || req.path === '/') {
    res.set("Cache-Control", "no-store");
  } else {
    res.set("Cache-Control", "public, max-age=60");
  }
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
  console.log(`ODT listening on port ${port}`);
});
