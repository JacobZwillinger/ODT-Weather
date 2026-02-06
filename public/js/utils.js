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
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // [BUGS] Fixed: missing response.ok check before parsing JSON
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
// Uses WAYPOINTS for mile markers (authoritative) and ELEVATION PROFILE for
// distance-from-trail (it has dense points along the actual trail line).
// Returns { mile, distanceFromTrail } where distanceFromTrail is in miles
export const findMileFromCoords = (lat, lon) => {
  // Use waypoints for mile marker lookup (they have accurate mile values)
  if (state.allWaypoints.length === 0) {
    return { mile: 0, distanceFromTrail: 0 };
  }

  // Find the closest waypoint for the mile marker
  let closestWp = state.allWaypoints[0];
  let minWpDist = Math.hypot(lon - closestWp.lon, lat - closestWp.lat);

  for (const wp of state.allWaypoints) {
    const dist = Math.hypot(lon - wp.lon, lat - wp.lat);
    if (dist < minWpDist) {
      minWpDist = dist;
      closestWp = wp;
    }
  }

  // For off-trail distance, use elevation profile (dense points along trail line)
  // This is more accurate than waypoints which are sparse
  let distanceFromTrail = 0;
  if (state.elevationProfile && state.elevationProfile.length > 0) {
    let closestProfile = state.elevationProfile[0];
    let minProfileDist = Math.hypot(lon - closestProfile.lon, lat - closestProfile.lat);
    for (const point of state.elevationProfile) {
      const dist = Math.hypot(lon - point.lon, lat - point.lat);
      if (dist < minProfileDist) {
        minProfileDist = dist;
        closestProfile = point;
      }
    }
    // Convert degrees to miles using the closest profile point
    distanceFromTrail = degreesToMiles(lat - closestProfile.lat, lon - closestProfile.lon, lat);
  } else {
    // Fallback to waypoint distance if no elevation profile
    distanceFromTrail = degreesToMiles(lat - closestWp.lat, lon - closestWp.lon, lat);
  }

  // Use the closest waypoint's mile - no interpolation needed
  // The waypoints are dense enough (~0.9 mi apart) for good accuracy
  return {
    mile: closestWp.mile,
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
