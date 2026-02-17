import { sectionPoints, weatherIcons } from './config.js';
import { getDayHeaders, getMapUrl } from './utils.js';

const getIcon = (iconName) => {
  return weatherIcons[iconName] || weatherIcons["cloudy"];
};

export const renderWeatherTable = (forecasts) => {
  const container = document.getElementById("container");
  const dayHeaders = getDayHeaders();

  let html = `
    <table>
      <thead>
        <tr>
          <th class="section-cell"></th>
          <th>Location</th>
          <th>Mile</th>
          ${dayHeaders.map(d => `<th>${d}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
  `;

  sectionPoints.forEach((point, index) => {
    const forecast = forecasts[index];
    html += `
      <tr>
        <td class="section-cell"><div class="section-indicator section-${point.section}"></div></td>
        <td>
          <div class="location-name"><a href="${getMapUrl(point.lat, point.lon)}" target="_blank" rel="noopener">${point.name}</a></div>
          <div class="elevation">${point.elevation.toLocaleString()}′</div>
        </td>
        <td class="mile">${point.mile}</td>
    `;

    // Add 7 day cells
    for (let i = 0; i < 7; i++) {
      if (forecast && forecast.daily && forecast.daily[i]) {
        const day = forecast.daily[i];
        const high = day.high !== undefined ? Math.round(day.high) : "--";
        const low = day.low !== undefined ? Math.round(day.low) : "--";
        const icon = day.icon || "cloudy";
        html += `<td class="forecast-cell"><span class="icon">${getIcon(icon)}</span><span class="temps">${high}° / ${low}°</span></td>`;
      } else {
        html += `<td class="forecast-cell">--</td>`;
      }
    }

    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
};

// Check if running inside Android WebView
const isAndroid = typeof AndroidBridge !== 'undefined';

// Transform raw PirateWeather API response into the format our app expects
// (same shape as server.js / api/forecast.js returns)
const adaptPirateWeatherResponse = (data, response) => {
  const currently = data.currently || {};
  const dailyData = data.daily?.data || [];

  const apiCalls = response.headers.get('x-forecast-api-calls');
  const rateLimit = response.headers.get('ratelimit-limit');
  const rateRemaining = response.headers.get('ratelimit-remaining');

  return {
    time: currently.time,
    summary: currently.summary,
    icon: currently.icon,
    temperature: currently.temperature,
    apparentTemperature: currently.apparentTemperature,
    windSpeed: currently.windSpeed,
    windGust: currently.windGust,
    humidity: currently.humidity,
    daily: dailyData.slice(0, 7).map(day => ({
      time: day.time,
      high: day.temperatureHigh,
      low: day.temperatureLow,
      icon: day.icon || '',
      summary: day.summary || ''
    })),
    _usage: {
      calls: apiCalls ? parseInt(apiCalls, 10) : null,
      limit: rateLimit ? parseInt(rateLimit, 10) : null,
      remaining: rateRemaining ? parseInt(rateRemaining, 10) : null
    }
  };
};

// Fetch a single forecast, handling both web (proxy) and Android (direct API) modes
const fetchForecast = async (lat, lon) => {
  if (isAndroid) {
    const apiKey = AndroidBridge.getApiKey();
    if (!apiKey) return null;
    const url = `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}?exclude=minutely,hourly,alerts&units=us`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Bad response');
    const data = await response.json();
    return adaptPirateWeatherResponse(data, response);
  } else {
    // Use user-supplied key from localStorage if available (bypasses proxy)
    const userKey = localStorage.getItem('pirateweatherApiKey');
    if (userKey) {
      const url = `https://api.pirateweather.net/forecast/${userKey}/${lat},${lon}?exclude=minutely,hourly,alerts&units=us`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Bad response');
      const data = await response.json();
      return adaptPirateWeatherResponse(data, response);
    }
    const response = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error('Bad response');
    return await response.json();
  }
};

export const loadForecasts = async () => {
  // On Android, check if API key is configured
  if (isAndroid) {
    const apiKey = AndroidBridge.getApiKey();
    if (!apiKey) {
      const container = document.getElementById('container');
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #666;">
          <p style="margin-bottom: 16px;"><strong>Weather API Key Required</strong></p>
          <p style="margin-bottom: 16px;">Enter your <a href="https://pirateweather.net" target="_blank">PirateWeather</a> API key to see forecasts.</p>
          <input type="text" id="apiKeyInput" placeholder="Enter API key..." style="width: 100%; max-width: 300px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; margin-bottom: 12px;" />
          <br/>
          <button id="saveApiKeyBtn" style="padding: 10px 24px; background: #1b1b1b; color: #fff; border: none; border-radius: 6px; font-size: 0.95rem; cursor: pointer;">Save Key</button>
        </div>
      `;
      document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
        const key = document.getElementById('apiKeyInput').value.trim();
        if (key) {
          AndroidBridge.setApiKey(key);
          loadForecasts(); // Retry with new key
        }
      });
      return;
    }
  }

  const forecasts = await Promise.all(
    sectionPoints.map(async (point) => {
      try {
        return await fetchForecast(point.lat, point.lon);
      } catch (error) {
        return null;
      }
    })
  );

  renderWeatherTable(forecasts);

  // Display API usage from the last forecast response
  const lastForecast = forecasts.find(f => f && f._usage && f._usage.calls !== null);
  if (lastForecast) {
    const { calls, limit } = lastForecast._usage;
    const usageEl = document.getElementById('apiUsage');
    if (usageEl && calls !== null) {
      const usageText = limit
        ? `API: ${calls.toLocaleString()} / ${limit.toLocaleString()}`
        : `API calls: ${calls.toLocaleString()}`;
      usageEl.textContent = usageText;
    }
  }
};
