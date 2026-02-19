require("dotenv").config();
const { parseLatLonQuery, fetchForecast } = require("../lib/pirateweather");

module.exports = async function handler(req, res) {
  const apiKey = process.env.PIRATEWEATHER_API_KEY;

  if (!apiKey) {
    res.statusCode = 500;
    return res.json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  const coords = parseLatLonQuery(req.query);
  if (!coords.ok) {
    res.statusCode = coords.status;
    return res.json({ error: coords.error });
  }

  res.setHeader("Cache-Control", "public, max-age=43200"); // 12 hours

  const result = await fetchForecast({
    apiKey,
    lat: coords.lat,
    lon: coords.lon
  });

  if (!result.ok) {
    res.statusCode = result.status;
    return res.json(result.body);
  }

  return res.json(result.body);
};
