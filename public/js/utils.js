import { MILE_EPSILON } from './config.js';

// Shared state for data
export const state = {
  waterSources: [],
  towns: [],
  allWaypoints: [],
  elevationProfile: null,
  currentMile: 0
};

// Load elevation profile (cached)
export const loadElevationProfile = async () => {
  if (state.elevationProfile) return state.elevationProfile;
  try {
    const response = await fetch('elevation-profile.json');
    state.elevationProfile = await response.json();
    return state.elevationProfile;
  } catch (error) {
    console.error('Failed to load elevation profile:', error);
    return null;
  }
};

// Get waypoint display name
export const getWaypointName = (source) => {
  if (source.landmark && source.landmark.trim()) {
    return source.landmark;
  }
  return source.details.replace(/^reliable:\s*/i, '').trim();
};

// Get short waypoint name (for map labels)
export const getWaypointShortName = (source) => {
  if (source.landmark && source.landmark.trim()) {
    return source.landmark.split('(')[0].split('/')[0].trim();
  }
  const details = source.details.replace(/^reliable:\s*/i, '').trim();
  return details.split(',')[0].trim();
};

// Find nearest waypoint to a mile marker
export const findNearestWaypoint = (mile) => {
  if (state.allWaypoints.length === 0) return null;

  let nearest = state.allWaypoints[0];
  let minDist = Math.abs(state.allWaypoints[0].mile - mile);

  for (const waypoint of state.allWaypoints) {
    const dist = Math.abs(waypoint.mile - mile);
    if (dist < minDist) {
      minDist = dist;
      nearest = waypoint;
    }
  }

  return { waypoint: nearest, distance: minDist };
};

// Convert degrees to approximate miles (at Oregon latitudes ~43°N)
// 1 degree latitude ≈ 69 miles, 1 degree longitude ≈ 50 miles at 43°N
const degreesToMiles = (latDiff, lonDiff, lat) => {
  const latMiles = Math.abs(latDiff) * 69;
  const lonMiles = Math.abs(lonDiff) * 69 * Math.cos(lat * Math.PI / 180);
  return Math.sqrt(latMiles * latMiles + lonMiles * lonMiles);
};

// Threshold for considering someone "off trail" (in miles)
export const OFF_TRAIL_THRESHOLD = 0.5;

// Find mile marker from lat/lon coordinates
// Returns { mile, distanceFromTrail } where distanceFromTrail is in miles
export const findMileFromCoords = async (lat, lon) => {
  const profile = await loadElevationProfile();
  if (!profile || profile.length === 0) return { mile: 0, distanceFromTrail: 0 };

  let closest = profile[0];
  let minDist = Math.hypot(lon - closest.lon, lat - closest.lat);

  for (const point of profile) {
    const dist = Math.hypot(lon - point.lon, lat - point.lat);
    if (dist < minDist) {
      minDist = dist;
      closest = point;
    }
  }

  // Convert the degree distance to miles
  const distanceFromTrail = degreesToMiles(lat - closest.lat, lon - closest.lon, lat);

  return {
    mile: closest.distance,
    distanceFromTrail: distanceFromTrail
  };
};

// Find next water source after given mile
export const findNextWater = (mile) => {
  return state.waterSources.find(s => s.mile > mile + MILE_EPSILON) || null;
};

// Find next town after given mile
export const findNextTown = (mile) => {
  return state.towns.find(t => t.mile > mile + MILE_EPSILON) || null;
};

// Get next 7 days starting from today
export const getDayHeaders = () => {
  const days = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayName = dayNames[date.getDay()];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    days.push(`${dayName}, ${month}/${day}`);
  }
  return days;
};

// Generate Google Maps URL
export const getMapUrl = (lat, lon) => {
  return `https://www.google.com/maps?q=${lat},${lon}`;
};
