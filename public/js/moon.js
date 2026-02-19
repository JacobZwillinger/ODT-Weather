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

// Hour angle when body rises/sets (h0 = standard altitude in degrees)
const cosHourAngle = (dec, lat, h0 = -0.833) => {
  const cosH = (Math.sin(h0 * RAD) - Math.sin(lat * RAD) * Math.sin(dec * RAD))
    / (Math.cos(lat * RAD) * Math.cos(dec * RAD));
  return cosH;
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
 * @param {Date} date - Local date (will use UTC midnight for calculations)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} tzOffsetMin - Local timezone offset in minutes (e.g. -420 for PDT)
 * @returns {{ phase, emoji, illumination, rise, set, transitAlt }}
 */
export const getMoonData = (date, lat, lon, tzOffsetMin) => {
  // Phase from current moment
  const age = moonAge(date);
  const phase = phaseInfo(age);

  // For rise/set, use midday of the local date in UT
  const utcOffset = tzOffsetMin / 60;
  // Midday UT = noon local - tz offset
  const localNoon = new Date(date);
  localNoon.setHours(12, 0, 0, 0);
  const utNoon = new Date(localNoon.getTime() - tzOffsetMin * 60000);
  const jd = julianDay(utNoon);

  // Moon RA/Dec at transit
  const { ra, dec } = moonRADec(jd);

  // Local sidereal time at UT noon
  const lst = localSiderealTime(jd, lon);

  // Hour angle at transit (H = LST - RA, in hours)
  const H0 = ((lst - ra) % 360 + 360) % 360; // degrees
  // Transit time in UT hours from noon: offset by H0
  // Hour angle in hours (0 at upper transit)
  const HhrsNoon = H0 > 180 ? (H0 - 360) / 15 : H0 / 15;

  // Transit UT
  const transitUT = 12 - HhrsNoon; // hours from 0h UT

  // Hour angle for rise/set
  const cosH = cosHourAngle(dec, lat, -0.833);
  if (Math.abs(cosH) > 1) {
    // Moon doesn't rise/set today
    return { ...phase, rise: cosH < -1 ? 'Circumpolar' : 'Below horizon', set: '--', age: age.toFixed(1) };
  }
  const H = Math.acos(cosH) * DEG / 15; // hours

  const riseUT = transitUT - H;
  const setUT  = transitUT + H;

  // Convert UT to local time
  const riseLocal = riseUT + utcOffset;
  const setLocal  = setUT  + utcOffset;

  return {
    ...phase,
    rise: fmtHour(riseLocal),
    set:  fmtHour(setLocal),
    age:  age.toFixed(1),
    illumination: Math.round(
      50 * (1 - Math.cos((age / 29.53058867) * 2 * Math.PI))
    )
  };
};
