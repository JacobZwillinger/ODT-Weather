require("dotenv").config();
const { fetchUsage } = require("../lib/pirateweather");

module.exports = async function handler(req, res) {
  const apiKey = process.env.PIRATEWEATHER_API_KEY;

  if (!apiKey) {
    res.statusCode = 500;
    return res.json({ error: "Missing PIRATEWEATHER_API_KEY." });
  }

  res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 min

  const result = await fetchUsage({ apiKey });
  if (!result.ok) {
    res.statusCode = result.status;
    return res.json(result.body);
  }

  return res.json(result.body);
};
