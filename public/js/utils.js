import { MILE_EPSILON } from './config.js';

// Shared state for data
export const state = {
  waterSources: [],
  towns: [],
  allWaypoints: [],
  elevationProfile: null,
  currentMile: 0,
  categories: {
    water: [],
    towns: [],
    navigation: [],
    toilets: []
  },
  visibleCategories: {
    'water-reliable': true,
    'water-other': true,
    towns: true,
    navigation: false,
    toilets: true
  }
};

// Load saved toggle state from localStorage
export const loadToggleState = () => {
  const saved = localStorage.getItem('categoryToggles');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(state.visibleCategories, parsed);
    } catch (e) {
      // ignore invalid stored state
    }
  }
};

// Save toggle state to localStorage
export const saveToggleState = () => {
  localStorage.setItem('categoryToggles', JSON.stringify(state.visibleCategories));
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

// Convert lat/lon to local XY in miles (approximate, at given reference latitude)
const toLocalMiles = (lat, lon, refLat) => {
  const y = lat * 69; // 1° lat ≈ 69 miles
  const x = lon * 69 * Math.cos(refLat * Math.PI / 180); // longitude correction
  return { x, y };
};

// Find the shortest distance from point P to segment AB, all in local mile coordinates.
// Returns the perpendicular distance (or distance to nearest endpoint if projection
// falls outside the segment).
const pointToSegmentDistMiles = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  // Project P onto line AB, clamp t to [0,1] to stay on segment
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
};

// Find mile marker from lat/lon coordinates
// Uses WAYPOINTS for mile markers, and the GPX TRACK (elevation profile
// coordinates) for distance-from-trail via perpendicular projection onto
// consecutive track segments.
//
// Map click handlers for on-trail features (route-line, section-circles,
// waypoint-icons) pass distanceFromTrail: 0 directly, since clicking on a
// trail feature means you are on the trail by definition.
// This function's distanceFromTrail is primarily used for GPS positioning.
// Returns { mile, distanceFromTrail } where distanceFromTrail is in miles
export const findMileFromCoords = (lat, lon) => {
  if (state.allWaypoints.length === 0) {
    return { mile: 0, distanceFromTrail: 0 };
  }

  // Find the closest waypoint for the mile marker (authoritative for mile values)
  let closestWp = state.allWaypoints[0];
  let minWpDist = Math.hypot(lon - closestWp.lon, lat - closestWp.lat);

  for (const wp of state.allWaypoints) {
    const dist = Math.hypot(lon - wp.lon, lat - wp.lat);
    if (dist < minWpDist) {
      minWpDist = dist;
      closestWp = wp;
    }
  }

  // Calculate distance from trail by projecting the point onto the track.
  // Use the elevation profile (dense GPX track coords, ~0.1 mi spacing) if available,
  // otherwise fall back to waypoint segments (~0.9 mi spacing).
  const track = (state.elevationProfile && state.elevationProfile.length >= 2)
    ? state.elevationProfile
    : state.allWaypoints;

  const p = toLocalMiles(lat, lon, lat);
  let minDist = Infinity;

  if (track.length >= 2) {
    for (let i = 0; i < track.length - 1; i++) {
      const a = toLocalMiles(track[i].lat, track[i].lon, lat);
      const b = toLocalMiles(track[i + 1].lat, track[i + 1].lon, lat);
      const dist = pointToSegmentDistMiles(p.x, p.y, a.x, a.y, b.x, b.y);
      if (dist < minDist) minDist = dist;
    }
  } else {
    // Single point — distance to it
    minDist = degreesToMiles(lat - track[0].lat, lon - track[0].lon, lat);
  }

  return {
    mile: closestWp.mile,
    distanceFromTrail: minDist
  };
};

// Find next water source after given mile
export const findNextWater = (mile) => {
  return state.waterSources.find(s => s.mile > mile + MILE_EPSILON) || null;
};

// Find next reliable water source after given mile
export const findNextReliableWater = (mile) => {
  return state.waterSources.find(s => s.mile > mile + MILE_EPSILON && s.subcategory === 'reliable') || null;
};

// Find next non-reliable water source after given mile
export const findNextOtherWater = (mile) => {
  return state.waterSources.find(s => s.mile > mile + MILE_EPSILON && s.subcategory !== 'reliable') || null;
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
