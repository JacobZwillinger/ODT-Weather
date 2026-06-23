// Moon phase and rise/set calculations
// Pure astronomical math, no external APIs

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ---- Moon Phase ----
// Returns age of moon in days (0–29.53) from a known new moon epoch
const moonAge = (date) => {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z'); // Jan 6, 2000 new moon
  const synodicPeriod = 29.53058867;
  const diffDays = (date - knownNewMoon) / 86400000;
  return ((diffDays % synodicPeriod) + synodicPeriod) % synodicPeriod;
};

const phaseInfo = (age) => {
  // age: 0–29.53 days
  if (age < 1.85)  return { name: 'New Moon',       emoji: '🌑', illumination: 0 };
  if (age < 5.54)  return { name: 'Waxing Crescent', emoji: '🌒', illumination: Math.round((age / 7.38) * 100) };
  if (age < 9.22)  return { name: 'First Quarter',   emoji: '🌓', illumination: 50 };
  if (age < 12.91) return { name: 'Waxing Gibbous',  emoji: '🌔', illumination: Math.round(50 + ((age - 9.22) / 7.38) * 50) };
  if (age < 16.61) return { name: 'Full Moon',       emoji: '🌕', illumination: 100 };
  if (age < 20.30) return { name: 'Waning Gibbous',  emoji: '🌖', illumination: Math.round(100 - ((age - 16.61) / 7.38) * 50) };
  if (age < 23.99) return { name: 'Last Quarter',    emoji: '🌗', illumination: 50 };
  if (age < 27.68) return { name: 'Waning Crescent', emoji: '🌘', illumination: Math.round(((29.53 - age) / 7.38) * 50) };
  return { name: 'New Moon', emoji: '🌑', illumination: 0 };
};

// ---- Moon Rise/Set ----
// Simplified algorithm based on Jean Meeus "Astronomical Algorithms"
// Returns local times for moonrise and moonset on the given date

const julianDay = (date) => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440;
  let A = Math.floor(y / 100);
  let B = 2 - A + Math.floor(A / 4);
  if (m <= 2) { return Math.floor(365.25 * (y - 1 + 4716)) + Math.floor(30.6001 * (m + 13)) + d + B - 1524.5; }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
};

// Compute moon's RA/Dec for a given JDE
const moonRADec = (jde) => {
  const T = (jde - 2451545.0) / 36525;
  // Fundamental arguments (degrees)
  const L = (218.3164477 + 481267.88123421 * T - 0.0015786 * T*T + T*T*T/538841 - T*T*T*T/65194000) % 360;
  const D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T*T + T*T*T/545868 - T*T*T*T/113065000) % 360;
  const M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T*T + T*T*T/24490000) % 360;
  const Mp= (93.2720950 + 477198.8675055 * T + 0.0086972 * T*T + T*T*T/56250 - T*T*T*T/327270) % 360;
  const F = (93.2720993 + 483202.0175273 * T - 0.0034029 * T*T - T*T*T/3526000 + T*T*T*T/863310000) % 360;

  // Simplified longitude correction (major terms only)
  const dL = 6288774 * Math.sin(Mp * RAD)
    + 1274027 * Math.sin((2*D - Mp) * RAD)
    + 658314  * Math.sin(2*D * RAD)
    + 213618  * Math.sin(2*Mp * RAD)
    - 185116  * Math.sin(M * RAD)
    - 114332  * Math.sin(2*F * RAD);

  const lon = (L + dL / 1000000) % 360;

  // Simplified latitude (major term)
  const dB = 5128122 * Math.sin(F * RAD)
    + 280602  * Math.sin((Mp + F) * RAD)
    + 277693  * Math.sin((Mp - F) * RAD);

  const lat = dB / 1000000;

  // Convert to RA/Dec (simplified, obliquity ~23.44°)
  const eps = 23.44 * RAD;
  const lonR = lon * RAD;
  const latR = lat * RAD;

  const sinRA = Math.sin(lonR) * Math.cos(eps) - Math.tan(latR) * Math.sin(eps);
  const cosRA = Math.cos(lonR);
  let ra = Math.atan2(sinRA, cosRA) * DEG;
  if (ra < 0) ra += 360;

  const sinDec = Math.sin(latR) * Math.cos(eps) + Math.cos(latR) * Math.sin(eps) * Math.sin(lonR);
  const dec = Math.asin(sinDec) * DEG;

  return { ra, dec };
};

// Compute local sidereal time (degrees)
const localSiderealTime = (jd, lonDeg) => {
  const T = (jd - 2451545.0) / 36525;
  const theta0 = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T*T - T*T*T / 38710000;
  return ((theta0 + lonDeg) % 360 + 360) % 360;
};

// Low-precision solar RA/Dec for a given Julian day (Meeus ch. 25, ~0.01° good).
const sunRADec = (jd) => {
  const n = jd - 2451545.0;
  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;   // mean longitude
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ecliptic lon
  const eps = (23.439 - 0.0000004 * n) * RAD;                // obliquity
  let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;
  if (ra < 0) ra += 360;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * DEG;
  return { ra, dec };
};

// Altitude (degrees) of a body above the horizon at a given Julian day.
const altitudeDeg = (radecFn, jd, lat, lon) => {
  const { ra, dec } = radecFn(jd);
  const lst = localSiderealTime(jd, lon);          // degrees
  const H = (((lst - ra) % 360 + 360) % 360) * RAD; // hour angle
  const latR = lat * RAD, decR = dec * RAD;
  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
};

// Find rise/set for the local calendar date by scanning altitude across the day
// in small steps and interpolating horizon crossings. Robust for both the fast-
// moving moon and the sun, and degrades gracefully to circumpolar/below-horizon.
// Returns { rise, set } as fractional local hours, or null when no crossing.
const findRiseSet = (radecFn, date, lat, lon, tzOffsetMin, h0) => {
  // Local midnight of the viewed date, derived from the trail's UTC offset rather
  // than the runtime's timezone. Shift the instant into "local time as UTC",
  // truncate to that local day, then shift back to the true UT instant.
  const shifted = new Date(date.getTime() + tzOffsetMin * 60000);
  const utMidnightMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
    - tzOffsetMin * 60000;

  const altAtLocalHour = (h) => {
    const jd = julianDay(new Date(utMidnightMs + h * 3600000));
    return altitudeDeg(radecFn, jd, lat, lon);
  };

  const step = 0.25; // 15-minute scan resolution
  let rise = null, set = null;
  let aboveCount = 0, samples = 0;
  let prevAlt = altAtLocalHour(0) - h0;
  if (prevAlt >= 0) aboveCount++;
  samples++;

  for (let h = step; h <= 24 + 1e-9; h += step) {
    const alt = altAtLocalHour(h) - h0;
    if (alt >= 0) aboveCount++;
    samples++;
    if (prevAlt < 0 && alt >= 0 && rise === null) {
      rise = (h - step) + step * (-prevAlt) / (alt - prevAlt);
    } else if (prevAlt >= 0 && alt < 0 && set === null) {
      set = (h - step) + step * (prevAlt) / (prevAlt - alt);
    }
    prevAlt = alt;
  }

  return { rise, set, alwaysUp: rise === null && set === null && aboveCount === samples };
};

// Format fractional hour → "H:MM AM/PM"
const fmtHour = (h) => {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`;
};

/**
 * Calculate moon data for a given date and location.
 * @param {Date} date - Local date/time
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} tzOffsetMin - Local timezone offset in minutes (e.g. -420 for PDT)
 * @returns {{ name, emoji, illumination, rise, set, age }}
 */
export const getMoonData = (date, lat, lon, tzOffsetMin) => {
  const age = moonAge(date);
  const phase = phaseInfo(age);

  // Moon standard altitude at rise/set is ~+0.125° (mean parallax minus refraction
  // and semidiameter), unlike the sun's -0.833°.
  const { rise, set, alwaysUp } = findRiseSet(moonRADec, date, lat, lon, tzOffsetMin, 0.125);

  const result = {
    ...phase,
    age: age.toFixed(1),
    illumination: Math.round(50 * (1 - Math.cos((age / 29.53058867) * 2 * Math.PI)))
  };

  if (rise === null && set === null) {
    result.rise = alwaysUp ? 'Circumpolar' : 'Below horizon';
    result.set = '--';
  } else {
    result.rise = rise !== null ? fmtHour(rise) : '--';
    result.set = set !== null ? fmtHour(set) : '--';
  }
  return result;
};

/**
 * Calculate sunrise/sunset for a given date and location.
 * @param {Date} date - Local date/time
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} tzOffsetMin - Local timezone offset in minutes (e.g. -420 for PDT)
 * @returns {{ sunrise, sunset, dayLength }}
 */
export const getSunData = (date, lat, lon, tzOffsetMin) => {
  // Standard altitude for the sun's upper limb, including atmospheric refraction.
  const { rise, set, alwaysUp } = findRiseSet(sunRADec, date, lat, lon, tzOffsetMin, -0.833);

  if (rise === null && set === null) {
    return {
      sunrise: alwaysUp ? 'Up all day' : 'Down all day',
      sunset: '--',
      dayLength: alwaysUp ? '24h' : '0h'
    };
  }

  let dayLength = '--';
  if (rise !== null && set !== null) {
    const hours = ((set - rise) % 24 + 24) % 24;
    dayLength = `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  }

  return {
    sunrise: rise !== null ? fmtHour(rise) : '--',
    sunset: set !== null ? fmtHour(set) : '--',
    dayLength
  };
};
