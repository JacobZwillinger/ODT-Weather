import { weatherIcons } from './config.js';
import { getDayHeaders, getSectionPoints, state } from './utils.js';

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

// Group hourly data into calendar days (up to 4). Returns:
// [{ label, hours }]  where hours = all hours on that calendar day.
const sliceByDay = (hourlyData) => {
  if (!hourlyData || hourlyData.length === 0) return [];

  const byDate = {};
  const dateOrder = [];
  for (const h of hourlyData) {
    const key = localDateStr(h.time);
    if (!byDate[key]) { byDate[key] = []; dateOrder.push(key); }
    byDate[key].push(h);
  }

  return dateOrder.slice(0, 4).map((dateKey, i) => {
    const hours = byDate[dateKey];
    const d = new Date(hours[0].time * 1000);
    const label = i === 0 ? 'Today' : DAY_NAMES[d.getDay()];
    return { label, hours };
  });
};

// Summarize a full calendar day's hours into display values.
// high  = max temp from daytime hours (6–21); fallback all hours
// low   = min temp from overnight hours (0–5 or 22–23); fallback all hours
// icon  = most common icon among daytime hours (6–21)
// precipChance = max probability across all hours, rounded to 10%
// precipAmount = sum of intensity across all hours
const summarizeDay = (hours) => {
  if (!hours || hours.length === 0) return null;

  const dayHours = hours.filter(h => { const hr = localHour(h.time); return hr >= 6 && hr <= 21; });
  const nightHours = hours.filter(h => { const hr = localHour(h.time); return hr < 6 || hr >= 22; });

  const iconSource = dayHours.length > 0 ? dayHours : hours;
  const iconCounts = {};
  for (const h of iconSource) { iconCounts[h.icon] = (iconCounts[h.icon] || 0) + 1; }
  const icon = Object.entries(iconCounts).sort((a, b) => b[1] - a[1])[0][0];

  const dayTemps = (dayHours.length > 0 ? dayHours : hours).map(h => h.temp).filter(t => t !== undefined);
  const high = dayTemps.length > 0 ? Math.round(Math.max(...dayTemps)) : null;

  const nightTemps = (nightHours.length > 0 ? nightHours : hours).map(h => h.temp).filter(t => t !== undefined);
  const low = nightTemps.length > 0 ? Math.round(Math.min(...nightTemps)) : null;

  const maxChance = Math.max(...hours.map(h => h.precipProbability || 0));
  const precipChance = Math.round(maxChance * 10) * 10;
  const precipAmount = hours.reduce((sum, h) => sum + (h.precipIntensity || 0), 0);

  return { icon, high, low, precipChance, precipAmount };
};

// ------- Hourly Detail Modal -------

let hourlyModalInitialized = false;

const closeHourlyModal = () => {
  document.getElementById('hourlyModal')?.classList.remove('visible');
};

const openHourlyModal = (locationName, periodLabel, hours) => {
  const modal = document.getElementById('hourlyModal');
  const title = document.getElementById('hourlyModalTitle');
  const body = document.getElementById('hourlyModalBody');
  if (!modal || !title || !body) return;

  title.textContent = `${locationName} — ${periodLabel}`;

  body.innerHTML = hours.map(h => {
    const d = new Date(h.time * 1000);
    const hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 || 12;
    const timeStr = `${hr12} ${ampm}`;
    const temp = h.temp !== undefined ? Math.round(h.temp) + '°' : '--';
    const chance = (h.precipProbability || 0) > 0.04 ? Math.round(h.precipProbability * 100) + '%' : '';
    const amount = h.precipIntensity > 0.01 ? h.precipIntensity.toFixed(2) + '″' : '';
    const isHeavy = (h.precipProbability || 0) >= 0.6;
    const precipClass = isHeavy ? 'precip-heavy' : chance ? 'precip-mod' : '';
    return `<div class="hm-row${isHeavy ? ' hm-row-heavy' : ''}">
      <span class="hm-time">${timeStr}</span>
      <span class="hm-icon">${getIcon(h.icon)}</span>
      <span class="hm-temp">${temp}</span>
      <span class="hm-precip ${precipClass}">${chance}</span>
      <span class="hm-amount">${amount}</span>
    </div>`;
  }).join('');

  if (!hourlyModalInitialized) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeHourlyModal(); });
    document.getElementById('hourlyModalClose')?.addEventListener('click', closeHourlyModal);
    hourlyModalInitialized = true;
  }

  history.pushState({ panel: 'hourlyModal' }, '');
  modal.classList.add('visible');
};

// ------- Weather Table -------

export const renderWeatherTable = (forecasts) => {
  const container = document.getElementById("container");
  const sectionPoints = getSectionPoints();

  const sampleForecast = forecasts.find(f => f && f.hourly && f.hourly.length > 0);
  const sampleDays = sampleForecast ? sliceByDay(sampleForecast.hourly) : [];
  const dayLabels = sampleDays.length > 0
    ? sampleDays.map(d => d.label)
    : getDayHeaders().slice(0, 4);

  const useHourly = sampleDays.length > 0;
  const colCount = dayLabels.length;

  let html = `
    <table>
      <thead>
        <tr>
          <th class="section-cell"></th>
          <th class="location-header">Location</th>
          <th class="mile-header">Mile</th>
          ${dayLabels.map(l => `<th class="day-header">${l}</th>`).join("")}
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
          <div class="location-name">${point.name}</div>
          <div class="elevation">${point.elevation.toLocaleString()}′</div>
        </td>
        <td class="mile">${point.mile}</td>
    `;

    if (useHourly && forecast && forecast.hourly && forecast.hourly.length > 0) {
      const days = sliceByDay(forecast.hourly);
      for (let i = 0; i < colCount; i++) {
        const day = days[i];
        if (!day) { html += `<td class="forecast-cell">--</td>`; continue; }
        const s = summarizeDay(day.hours);
        if (!s) { html += `<td class="forecast-cell">--</td>`; continue; }

        const precipColor = s.precipChance >= 60 ? 'precip-heavy' : s.precipChance >= 20 ? 'precip-mod' : '';
        const precipStr = s.precipChance > 0
          ? `<span class="fc-precip ${precipColor}">${s.precipChance}%</span>`
          : '';
        const amountStr = s.precipAmount > 0.01
          ? `<span class="fc-amount">${s.precipAmount.toFixed(2)}″</span>`
          : '';
        const highStr = s.high !== null ? `<span class="fc-high">${s.high}°</span>` : '';
        const lowStr = s.low !== null ? `<span class="fc-low">${s.low}°</span>` : '';

        html += `<td class="forecast-cell" data-location-idx="${index}" data-day-idx="${i}">
          <div class="fc-inner">
            <span class="fc-icon">${getIcon(s.icon)}</span>
            <div class="fc-values">
              <div class="fc-temps">${highStr}${lowStr}</div>
              <div class="fc-precip-row">${precipStr}${amountStr}</div>
            </div>
          </div>
        </td>`;
      }
    } else if (!useHourly && forecast && forecast.daily) {
      for (let i = 0; i < colCount; i++) {
        const day = forecast.daily[i];
        if (day) {
          const high = day.high !== undefined ? `<span class="fc-high">${Math.round(day.high)}°</span>` : '';
          const low = day.low !== undefined ? `<span class="fc-low">${Math.round(day.low)}°</span>` : '';
          html += `<td class="forecast-cell"><div class="fc-inner"><span class="fc-icon">${getIcon(day.icon || 'cloudy')}</span><div class="fc-values"><div class="fc-temps">${high}${low}</div></div></div></td>`;
        } else {
          html += `<td class="forecast-cell">--</td>`;
        }
      }
    } else {
      for (let i = 0; i < colCount; i++) {
        html += `<td class="forecast-cell">--</td>`;
      }
    }

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Wire click listeners for hourly modal
  if (useHourly) {
    container.querySelectorAll('.forecast-cell[data-location-idx]').forEach(cell => {
      cell.addEventListener('click', () => {
        const locIdx = parseInt(cell.dataset.locationIdx);
        const dayIdx = parseInt(cell.dataset.dayIdx);
        const forecast = forecasts[locIdx];
        if (!forecast || !forecast.hourly) return;
        const days = sliceByDay(forecast.hourly);
        const day = days[dayIdx];
        if (!day) return;
        openHourlyModal(sectionPoints[locIdx]?.name || '', day.label, day.hours);
      });
    });
  }
};

// ------- API / Fetch -------

const isAndroid = typeof AndroidBridge !== 'undefined';
const getForecastCacheKey = () => `${state.trail.id}ForecastCacheV1`;

const hasUsableForecastData = (forecast) => {
  if (!forecast) return false;
  const hasHourly = Array.isArray(forecast.hourly) && forecast.hourly.length > 0;
  const hasDaily = Array.isArray(forecast.daily) && forecast.daily.length > 0;
  return hasHourly || hasDaily;
};

const loadForecastCache = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getForecastCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.forecasts)) return null;
    return {
      savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null,
      forecasts: parsed.forecasts
    };
  } catch (error) {
    return null;
  }
};

const saveForecastCache = (forecasts) => {
  if (typeof localStorage === 'undefined') return;
  if (!Array.isArray(forecasts) || !forecasts.some(hasUsableForecastData)) return;
  try {
    localStorage.setItem(getForecastCacheKey(), JSON.stringify({
      savedAt: Date.now(),
      forecasts
    }));
  } catch (error) {
    // Ignore storage errors (quota/private mode)
  }
};

const getCacheTimestampLabel = (savedAt) => {
  if (!Number.isFinite(savedAt)) return '';
  try {
    return new Date(savedAt).toLocaleString();
  } catch (error) {
    return '';
  }
};

// ------- Streamflow -------

const STREAMFLOW_PARAMETER_CODES = {
  discharge: '00060',
  stage: '00065'
};

const getStreamflowCacheKey = (trailId = state.trail.id) => `${trailId}StreamflowCacheV1`;

const normalizeSiteCode = (code) => String(code || '').replace(/^USGS-/, '');

const getLatestTimeSeriesValue = (series) => {
  const values = series?.values?.[0]?.value;
  if (!Array.isArray(values)) return null;

  for (let i = values.length - 1; i >= 0; i -= 1) {
    const reading = values[i];
    const value = Number.parseFloat(reading?.value);
    if (Number.isFinite(value)) {
      return {
        value,
        dateTime: reading.dateTime || null,
        qualifiers: Array.isArray(reading.qualifiers) ? reading.qualifiers : []
      };
    }
  }

  return null;
};

const getTimeSeriesParameterCode = (series) => {
  const codes = series?.variable?.variableCode;
  if (!Array.isArray(codes)) return null;
  return codes.map(code => code?.value).find(Boolean) || null;
};

const saveStreamflowCache = (records, trailId = state.trail.id) => {
  if (typeof localStorage === 'undefined' || !Array.isArray(records) || records.length === 0) return;
  try {
    localStorage.setItem(getStreamflowCacheKey(trailId), JSON.stringify({
      savedAt: Date.now(),
      records
    }));
  } catch (error) {
    // Ignore storage errors.
  }
};

const loadStreamflowCache = (trailId = state.trail.id) => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getStreamflowCacheKey(trailId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const formatStreamflowNumber = (value, maximumFractionDigits = 0) => {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString(undefined, { maximumFractionDigits });
};

const formatStreamflowDate = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export const adaptUsgsStreamflowResponse = (data, gauges) => {
  const bySite = new Map(gauges.map(gauge => [
    gauge.id,
    {
      ...gauge,
      discharge: null,
      stage: null,
      observedAt: null,
      provisional: false
    }
  ]));

  const seriesList = data?.value?.timeSeries;
  if (!Array.isArray(seriesList)) return [...bySite.values()];

  seriesList.forEach((series) => {
    const siteCode = normalizeSiteCode(series?.sourceInfo?.siteCode?.[0]?.value);
    const record = bySite.get(siteCode);
    if (!record) return;

    const parameterCode = getTimeSeriesParameterCode(series);
    const reading = getLatestTimeSeriesValue(series);
    if (!reading) return;

    const unit = series?.variable?.unit?.unitCode || '';
    const value = {
      value: reading.value,
      unit,
      dateTime: reading.dateTime
    };

    if (parameterCode === STREAMFLOW_PARAMETER_CODES.discharge) {
      record.discharge = value;
    } else if (parameterCode === STREAMFLOW_PARAMETER_CODES.stage) {
      record.stage = value;
    }

    if (!record.observedAt || new Date(reading.dateTime) > new Date(record.observedAt)) {
      record.observedAt = reading.dateTime;
    }
    if (reading.qualifiers.includes('P')) {
      record.provisional = true;
    }
  });

  return [...bySite.values()];
};

const fetchStreamflowGauges = async (gauges) => {
  const sites = gauges.map(gauge => gauge.id).join(',');
  const parameterCd = Object.values(STREAMFLOW_PARAMETER_CODES).join(',');
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(sites)}&parameterCd=${parameterCd}&siteStatus=all&period=P1D`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Bad streamflow response');
  return adaptUsgsStreamflowResponse(await response.json(), gauges);
};

export const renderStreamflowPanel = (records, { cachedAt = null, error = false } = {}) => {
  const container = document.getElementById('container');
  if (!container) return;

  container.querySelector('.streamflow-panel')?.remove();
  const gauges = state.trail.streamflowGauges || [];
  if (!gauges.length) return;

  const panel = document.createElement('section');
  panel.className = `streamflow-panel${error ? ' streamflow-panel-warning' : ''}`;
  panel.innerHTML = `
    <div class="streamflow-header">
      <div>
        <div class="streamflow-title">Rio Grande Flow</div>
        <div class="streamflow-subtitle">${error ? 'USGS unavailable' : 'USGS live gauges'}${cachedAt ? ` · cached ${getCacheTimestampLabel(cachedAt)}` : ''}</div>
      </div>
    </div>
    <div class="streamflow-grid">
      ${records.map(record => {
        const discharge = record.discharge?.value;
        const stage = record.stage?.value;
        const dischargeUnit = record.discharge?.unit || 'ft3/s';
        const stageUnit = record.stage?.unit || 'ft';
        const observed = formatStreamflowDate(record.observedAt);
        return `
          <a class="streamflow-card" href="${record.url}" target="_blank" rel="noopener">
            <div class="streamflow-card-top">
              <span class="streamflow-name">${record.name}</span>
              <span class="streamflow-mile">Mile ${record.mile}</span>
            </div>
            <div class="streamflow-context">${record.context}</div>
            <div class="streamflow-reading">
              <span class="streamflow-value">${formatStreamflowNumber(discharge)}</span>
              <span class="streamflow-unit">${dischargeUnit === 'ft3/s' ? 'cfs' : dischargeUnit}</span>
            </div>
            <div class="streamflow-meta">
              ${Number.isFinite(stage) ? `Stage ${formatStreamflowNumber(stage, 2)} ${stageUnit}` : 'Stage --'}
              ${observed ? ` · ${observed}` : ''}
              ${record.provisional ? ' · provisional' : ''}
            </div>
          </a>
        `;
      }).join('')}
    </div>
  `;
  container.prepend(panel);
};

const loadStreamflowPanel = async () => {
  const trailId = state.trail.id;
  const gauges = state.trail.streamflowGauges || [];
  if (!gauges.length) {
    document.getElementById('container')?.querySelector('.streamflow-panel')?.remove();
    return;
  }

  renderStreamflowPanel(gauges.map(gauge => ({ ...gauge, discharge: null, stage: null })));
  try {
    const records = await fetchStreamflowGauges(gauges);
    if (state.trail.id !== trailId) return;
    saveStreamflowCache(records, trailId);
    renderStreamflowPanel(records);
  } catch (error) {
    if (state.trail.id !== trailId) return;
    const cached = loadStreamflowCache(trailId);
    if (cached?.records?.length) {
      renderStreamflowPanel(cached.records, { cachedAt: cached.savedAt, error: true });
    } else {
      renderStreamflowPanel(gauges.map(gauge => ({ ...gauge, discharge: null, stage: null })), { error: true });
    }
  }
};

const setWeatherStatusBanner = (message, level = 'info') => {
  const container = document.getElementById('container');
  if (!container) return;

  const existing = container.querySelector('.weather-status-banner');
  if (!message) {
    if (existing) existing.remove();
    return;
  }

  const banner = existing || document.createElement('div');
  banner.className = `weather-status-banner weather-status-${level}`;
  banner.textContent = message;
  if (!existing) container.prepend(banner);
};

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
    hourly: hourlyData.slice(0, 168).map(h => ({
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

// Show API key setup screen in the weather overlay container. This is only used
// by the Android bridge path; web builds use the server-side forecast proxy.
const showApiKeySetup = () => {
  const container = document.getElementById('container');
  container.innerHTML = `
    <div class="weather-api-setup">
      <p class="weather-setup-title">Weather API Key Required</p>
      <p class="weather-setup-desc">Enter your free <a href="https://pirateweather.net" target="_blank" rel="noopener">PirateWeather</a> API key to see forecasts along the trail.</p>
      <div class="weather-key-row">
        <input type="password" id="weatherApiKeyInput" class="weather-key-input" placeholder="Paste API key…" autocomplete="off" spellcheck="false" />
        <button id="weatherApiKeySave" class="weather-key-save">Save</button>
      </div>
      <p class="weather-key-hint">Free tier: sign up at pirateweather.net → subscribe to Forecast API → copy key from dashboard</p>
    </div>
  `;
  const save = () => {
    const key = document.getElementById('weatherApiKeyInput').value.trim();
    if (key) { localStorage.setItem('pirateweatherApiKey', key); loadForecasts(); }
  };
  document.getElementById('weatherApiKeySave').addEventListener('click', save);
  document.getElementById('weatherApiKeyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
};

// Append a subtle "Change API key" link below the forecast table
const appendChangeKeyLink = () => {
  const container = document.getElementById('container');
  if (!container || container.querySelector('.weather-change-key')) return;
  const p = document.createElement('p');
  p.className = 'weather-change-key';
  p.innerHTML = '<a href="#" id="btnChangeWeatherKey">Change API key</a>';
  container.appendChild(p);
  document.getElementById('btnChangeWeatherKey').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('pirateweatherApiKey');
    showApiKeySetup();
  });
};

const fetchForecast = async (lat, lon) => {
  if (isAndroid) {
    const apiKey = AndroidBridge.getApiKey();
    if (!apiKey) return null;
    const url = `https://api.pirateweather.net/forecast/${apiKey}/${lat},${lon}?exclude=minutely,alerts&units=us&extend=hourly`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Bad response');
    const data = await response.json();
    return adaptPirateWeatherResponse(data, response);
  }

  const url = `/api/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Bad response');
  return response.json();
};

export const loadForecasts = async () => {
  if (isAndroid) {
    const apiKey = AndroidBridge.getApiKey();
    if (!apiKey) { showApiKeySetup(); return; }
  }

  const forecasts = await Promise.all(
    getSectionPoints().map(async (point) => {
      try {
        return await fetchForecast(point.lat, point.lon);
      } catch (error) {
        return null;
      }
    })
  );

  const cache = loadForecastCache();
  const mergedForecasts = forecasts.map((forecast, idx) => {
    if (hasUsableForecastData(forecast)) return forecast;
    return cache?.forecasts?.[idx] || null;
  });

  const liveCount = forecasts.filter(hasUsableForecastData).length;
  const mergedCount = mergedForecasts.filter(hasUsableForecastData).length;
  const usedCache = mergedCount > liveCount;

  if (liveCount > 0) {
    saveForecastCache(mergedForecasts);
  }

  renderWeatherTable(mergedForecasts);
  loadStreamflowPanel();
  if (isAndroid) appendChangeKeyLink();

  if (liveCount === 0 && mergedCount === 0) {
    setWeatherStatusBanner('Offline: no cached forecast available yet. Connect once to download forecasts.', 'error');
  } else if (usedCache && liveCount === 0) {
    const ts = getCacheTimestampLabel(cache?.savedAt);
    setWeatherStatusBanner(`Offline: showing cached forecast${ts ? ` from ${ts}` : ''}.`, 'warning');
  } else if (usedCache) {
    const ts = getCacheTimestampLabel(cache?.savedAt);
    setWeatherStatusBanner(`Some sections failed to refresh; using cached forecast${ts ? ` from ${ts}` : ''} for missing data.`, 'info');
  } else {
    setWeatherStatusBanner('');
  }

  const usageEl = document.getElementById('apiUsage');
  if (usageEl) usageEl.textContent = '';

  const lastForecast = mergedForecasts.find(f => f && f._usage && f._usage.calls !== null);
  if (lastForecast) {
    const { calls, limit } = lastForecast._usage;
    if (usageEl && calls !== null) {
      const usageText = limit
        ? `API: ${calls.toLocaleString()} / ${limit.toLocaleString()}`
        : `API calls: ${calls.toLocaleString()}`;
      usageEl.textContent = usageText;
    }
  }
};
