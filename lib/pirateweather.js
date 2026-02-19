const FORECAST_TIMEOUT_MS = 10000;
const USAGE_TIMEOUT_MS = 8000;
const DEFAULT_EXCLUDE = "minutely,alerts";
const USAGE_COORDS = { lat: 44.0582, lon: -121.3153 }; // Bend, OR

const toIntOrNull = (value) => {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const buildForecastUrl = (apiKey, lat, lon, exclude = DEFAULT_EXCLUDE) => {
  const url = new URL(`https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}`);
  url.searchParams.set("exclude", exclude);
  url.searchParams.set("units", "us");
  return url;
};

const parseLatLonQuery = (query = {}) => {
  const lat = Number.parseFloat(query.lat);
  const lon = Number.parseFloat(query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return { ok: false, status: 400, error: "lat and lon are required." };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, status: 400, error: "lat must be between -90 and 90." };
  }
  if (lon < -180 || lon > 180) {
    return { ok: false, status: 400, error: "lon must be between -180 and 180." };
  }

  return { ok: true, lat, lon };
};

const adaptForecastResponse = (data, response) => {
  const currently = data.currently || {};
  const dailyData = data.daily?.data || [];
  const hourlyData = data.hourly?.data || [];

  const apiCalls = response.headers.get("x-forecast-api-calls");
  const rateLimit = response.headers.get("ratelimit-limit");
  const rateRemaining = response.headers.get("ratelimit-remaining");

  return {
    time: currently.time,
    summary: currently.summary,
    icon: currently.icon,
    temperature: currently.temperature,
    apparentTemperature: currently.apparentTemperature,
    windSpeed: currently.windSpeed,
    windGust: currently.windGust,
    humidity: currently.humidity,
    daily: dailyData.slice(0, 7).map((day) => ({
      time: day.time,
      high: day.temperatureHigh,
      low: day.temperatureLow,
      icon: day.icon || "",
      summary: day.summary || ""
    })),
    hourly: hourlyData.slice(0, 96).map((h) => ({
      time: h.time,
      icon: h.icon || "",
      temp: h.temperature,
      precipProbability: h.precipProbability || 0,
      precipIntensity: h.precipIntensity || 0,
      precipType: h.precipType || "none",
      windSpeed: h.windSpeed || 0,
      summary: h.summary || ""
    })),
    _usage: {
      calls: toIntOrNull(apiCalls),
      limit: toIntOrNull(rateLimit),
      remaining: toIntOrNull(rateRemaining)
    }
  };
};

const upstreamError = (errorMessage, status = 500, extra = {}) => ({
  ok: false,
  status,
  body: { error: errorMessage, ...extra }
});

const fetchForecast = async ({ apiKey, lat, lon, timeoutMs = FORECAST_TIMEOUT_MS }) => {
  const url = buildForecastUrl(apiKey, lat, lon);
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      return upstreamError("PirateWeather API error", response.status, { status: response.status });
    }

    const data = await response.json();
    return { ok: true, status: 200, body: adaptForecastResponse(data, response) };
  } catch (error) {
    if (error?.name === "AbortError") {
      return upstreamError("PirateWeather request timed out.", 504);
    }
    console.error(error);
    return upstreamError("Unable to reach PirateWeather API.", 500);
  }
};

const fetchUsage = async ({ apiKey, timeoutMs = USAGE_TIMEOUT_MS }) => {
  const url = buildForecastUrl(
    apiKey,
    USAGE_COORDS.lat,
    USAGE_COORDS.lon,
    "minutely,hourly,daily,alerts"
  );

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      return upstreamError("PirateWeather API error", response.status, { status: response.status });
    }

    return {
      ok: true,
      status: 200,
      body: {
        apiCalls: toIntOrNull(response.headers.get("x-forecast-api-calls")),
        responseTime: response.headers.get("x-response-time") || null
      }
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return upstreamError("PirateWeather request timed out.", 504);
    }
    console.error(error);
    return upstreamError("Unable to check API usage.", 500);
  }
};

module.exports = {
  parseLatLonQuery,
  fetchForecast,
  fetchUsage
};
