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

export const loadForecasts = async () => {
  const forecasts = await Promise.all(
    sectionPoints.map(async (point) => {
      try {
        const response = await fetch(
          `/api/forecast?lat=${point.lat}&lon=${point.lon}`
        );
        if (!response.ok) {
          throw new Error("Bad response");
        }
        return await response.json();
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
    // [BUGS] Fixed: guard against null calls even though outer check exists, and null apiUsage element
    const usageEl = document.getElementById('apiUsage');
    if (usageEl && calls !== null) {
      const usageText = limit
        ? `API: ${calls.toLocaleString()} / ${limit.toLocaleString()}`
        : `API calls: ${calls.toLocaleString()}`;
      usageEl.textContent = usageText;
    }
  }
};
