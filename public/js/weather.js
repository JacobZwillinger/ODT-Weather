import { sectionPoints, weatherIcons } from './config.js';
import { getDayHeaders, getMapUrl } from './utils.js';

const getIcon = (iconName) => {
  return weatherIcons[iconName] || weatherIcons["cloudy"];
};

// ------- Day/Night slicing -------

const localHour = (unixSec) => new Date(unixSec * 1000).getHours();
const localDateStr = (unixSec) => {
  const d = new Date(unixSec * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Slice 48-hour array into 6 day/night periods (3 days × 2)
// Day   = hours 6–21 inclusive on that calendar day
// Night = hours 22–23 on that day + hours 0–5 on the NEXT day
const sliceDayNight = (hourlyData) => {
  if (!hourlyData || hourlyData.length === 0) return [];

  const byDate = {};
  const dateOrder = [];
  for (const h of hourlyData) {
    const key = localDateStr(h.time);
    if (!byDate[key]) { byDate[key] = []; dateOrder.push(key); }
    byDate[key].push(h);
  }

  const periods = [];
  const days = dateOrder.slice(0, 3);

  days.forEach((dateKey, i) => {
    const hours = byDate[dateKey] || [];
    const d = new Date(hours[0].time * 1000);
    const dayName = i === 0 ? 'Today' : DAY_NAMES[d.getDay()];

    const dayHours = hours.filter(h => { const hr = localHour(h.time); return hr >= 6 && hr <= 21; });
    const lateHours = hours.filter(h => localHour(h.time) >= 22);
    const nextKey = dateOrder[dateOrder.indexOf(dateKey) + 1];
    const earlyNextHours = nextKey
      ? (byDate[nextKey] || []).filter(h => localHour(h.time) <= 5)
      : [];
    const nightHours = [...lateHours, ...earlyNextHours];

    if (dayHours.length > 0) {
      periods.push({ label: `${dayName} Day`, period: 'day', hours: dayHours });
    }
    if (nightHours.length > 0) {
      periods.push({ label: `${dayName} Night`, period: 'night', hours: nightHours });
    }
  });

  return periods.slice(0, 6);
};

// Summarize a set of hours into a single display object
const summarizePeriod = (hours, period) => {
  if (!hours || hours.length === 0) return null;

  const iconCounts = {};
  for (const h of hours) { iconCounts[h.icon] = (iconCounts[h.icon] || 0) + 1; }
  const icon = Object.entries(iconCounts).sort((a, b) => b[1] - a[1])[0][0];

  const temps = hours.map(h => h.temp).filter(t => t !== undefined);
  const temp = period === 'day'
    ? Math.round(Math.max(...temps))
    : Math.round(Math.min(...temps));

  const maxChance = Math.max(...hours.map(h => h.precipProbability || 0));
  const precipChance = Math.round(maxChance * 10) * 10;
  const precipAmount = hours.reduce((sum, h) => sum + (h.precipIntensity || 0), 0);

  return { icon, temp, precipChance, precipAmount };
};

// ------- Inline Hourly Expansion -------

// Build the HTML for the expanded hourly sub-rows for one location's period.
// The first 3 columns (section swatch, location, mile) are left empty so the
// filmstrip starts directly under the forecast columns — no left-edge scroll.
const buildHourlyRows = (hours, forecastColCount) => {
  const hourCards = hours.map(h => {
    const d = new Date(h.time * 1000);
    const hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 || 12;
    const timeStr = `${hr12} ${ampm}`;
    const temp = h.temp !== undefined ? Math.round(h.temp) + '°' : '--';
    const chance = (h.precipProbability || 0) > 0 ? Math.round(h.precipProbability * 100) + '%' : '';
    const amount = h.precipIntensity > 0.01 ? h.precipIntensity.toFixed(2) + '″' : '';
    const isHeavy = (h.precipProbability || 0) >= 0.6;
    return `<div class="hourly-inline-row${isHeavy ? ' hourly-inline-heavy' : ''}">
      <span class="hi-time">${timeStr}</span>
      <span class="hi-icon">${getIcon(h.icon)}</span>
      <span class="hi-temp">${temp}</span>
      <span class="hi-precip${isHeavy ? ' precip-heavy' : (chance ? ' precip-mod' : '')}">${chance}</span>
      ${amount ? `<span class="hi-amount">${amount}</span>` : ''}
    </div>`;
  }).join('');

  // 3 fixed cols (section + location + mile) + forecast cols
  return `<tr class="hourly-expansion-row">
    <td class="hourly-expansion-spacer" colspan="3"></td>
    <td colspan="${forecastColCount}" class="hourly-expansion-cell">
      <div class="hourly-expansion-inner">
        <div class="hourly-inline-list">${hourCards}</div>
      </div>
    </td>
  </tr>`;
};

// Toggle inline expansion for a clicked forecast cell
let activeExpansion = null; // { rowEl, expansionEl }

const toggleExpansion = (cell, hours, forecastColCount) => {
  // If clicking the already-open row, close it
  if (activeExpansion && activeExpansion.cell === cell) {
    activeExpansion.expansionEl.remove();
    cell.classList.remove('forecast-cell-active');
    activeExpansion = null;
    return;
  }

  // Close any existing expansion
  if (activeExpansion) {
    activeExpansion.expansionEl.remove();
    activeExpansion.cell.classList.remove('forecast-cell-active');
    activeExpansion = null;
  }

  // Insert new expansion after the parent <tr>
  const parentRow = cell.closest('tr');
  const expansionHtml = buildHourlyRows(hours, forecastColCount);
  parentRow.insertAdjacentHTML('afterend', expansionHtml);
  const expansionEl = parentRow.nextElementSibling;

  // Scroll expansion into view smoothly
  expansionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  cell.classList.add('forecast-cell-active');
  activeExpansion = { cell, expansionEl };
};

// ------- Weather Table -------

export const renderWeatherTable = (forecasts) => {
  const container = document.getElementById("container");

  const sampleForecast = forecasts.find(f => f && f.hourly && f.hourly.length > 0);
  const samplePeriods = sampleForecast ? sliceDayNight(sampleForecast.hourly) : [];
  const periodLabels = samplePeriods.length > 0
    ? samplePeriods.map(p => p.label)
    : getDayHeaders();

  const useNewLayout = samplePeriods.length > 0;
  const forecastColCount = periodLabels.length;

  let html = `
    <table>
      <thead>
        <tr>
          <th class="section-cell"></th>
          <th class="location-header">Location</th>
          <th class="mile-header">Mile</th>
          ${periodLabels.map((l, i) => {
            const isNight = useNewLayout && samplePeriods[i]?.period === 'night';
            return `<th class="${isNight ? 'night-header' : 'day-header'}">${l}</th>`;
          }).join("")}
        </tr>
      </thead>
      <tbody>
  `;

  sectionPoints.forEach((point, index) => {
    const forecast = forecasts[index];
    html += `
      <tr>
        <td class="section-cell"><div class="section-indicator section-${point.section}"></div></td>
        <td class="location-cell">
          <div class="location-name"><a href="${getMapUrl(point.lat, point.lon)}" target="_blank" rel="noopener">${point.name}</a></div>
          <div class="elevation">${point.elevation.toLocaleString()}′</div>
        </td>
        <td class="mile">${point.mile}</td>
    `;

    if (useNewLayout && forecast && forecast.hourly && forecast.hourly.length > 0) {
      const periods = sliceDayNight(forecast.hourly);
      for (let i = 0; i < periodLabels.length; i++) {
        const p = periods[i];
        if (!p) { html += `<td class="forecast-cell">--</td>`; continue; }
        const s = summarizePeriod(p.hours, p.period);
        if (!s) { html += `<td class="forecast-cell">--</td>`; continue; }

        const isNight = p.period === 'night';
        const precipColor = s.precipChance >= 60 ? 'precip-heavy' : s.precipChance >= 20 ? 'precip-mod' : '';
        const precipStr = s.precipChance > 0 ? `<span class="fc-precip ${precipColor}">${s.precipChance}%</span>` : `<span class="fc-precip"></span>`;
        const amountStr = s.precipAmount > 0.01 ? `<span class="fc-amount">${s.precipAmount.toFixed(2)}″</span>` : '';

        html += `<td class="forecast-cell${isNight ? ' night-cell' : ' day-cell'}"
          data-location-idx="${index}" data-period-idx="${i}">
          <div class="fc-inner">
            <span class="fc-icon">${getIcon(s.icon)}</span>
            <div class="fc-values">
              <span class="fc-temp">${s.temp}°</span>
              ${precipStr}
              ${amountStr}
            </div>
          </div>
        </td>`;
      }
    } else if (!useNewLayout && forecast && forecast.daily) {
      for (let i = 0; i < 7; i++) {
        const day = forecast.daily[i];
        if (day) {
          const high = day.high !== undefined ? Math.round(day.high) : "--";
          const low = day.low !== undefined ? Math.round(day.low) : "--";
          html += `<td class="forecast-cell"><div class="fc-inner"><span class="fc-icon">${getIcon(day.icon || 'cloudy')}</span><div class="fc-values"><span class="fc-temp">${high}° / ${low}°</span></div></div></td>`;
        } else {
          html += `<td class="forecast-cell">--</td>`;
        }
      }
    } else {
      for (let i = 0; i < periodLabels.length; i++) {
        html += `<td class="forecast-cell">--</td>`;
      }
    }

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Wire click listeners for inline expansion
  if (useNewLayout) {
    const table = container.querySelector('table');
    container.querySelectorAll('.forecast-cell[data-location-idx]').forEach(cell => {
      cell.addEventListener('click', () => {
        const locIdx = parseInt(cell.dataset.locationIdx);
        const periodIdx = parseInt(cell.dataset.periodIdx);
        const forecast = forecasts[locIdx];
        if (!forecast || !forecast.hourly) return;
        const periods = sliceDayNight(forecast.hourly);
        const p = periods[periodIdx];
        if (!p) return;
        toggleExpansion(cell, p.hours, forecastColCount);
      });
    });
  }
};

// ------- API / Fetch -------

const isAndroid = typeof AndroidBridge !== 'undefined';

const adaptPirateWeatherResponse = (data, response) => {
  const currently = data.currently || {};
  const dailyData = data.daily?.data || [];
  const hourlyData = data.hourly?.data || [];

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
    hourly: hourlyData.slice(0, 48).map(h => ({
      time: h.time,
      icon: h.icon || '',
      temp: h.temperature,
      precipProbability: h.precipProbability || 0,
      precipIntensity: h.precipIntensity || 0,
      precipType: h.precipType || 'none',
      windSpeed: h.windSpeed || 0,
      summary: h.summary || ''
    })),
    _usage: {
      calls: apiCalls ? parseInt(apiCalls, 10) : null,
      limit: rateLimit ? parseInt(rateLimit, 10) : null,
      remaining: rateRemaining ? parseInt(rateRemaining, 10) : null
    }
  };
};

const fetchForecast = async (lat, lon) => {
  if (isAndroid) {
    const apiKey = AndroidBridge.getApiKey();
    if (!apiKey) return null;
    const url = `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}?exclude=minutely,alerts&units=us`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Bad response');
    const data = await response.json();
    return adaptPirateWeatherResponse(data, response);
  } else {
    const userKey = localStorage.getItem('pirateweatherApiKey');
    if (userKey) {
      const url = `https://api.pirateweather.net/forecast/${userKey}/${lat},${lon}?exclude=minutely,alerts&units=us`;
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
          loadForecasts();
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
