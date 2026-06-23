import { DEFAULT_TRAIL_ID, MILE_EPSILON, TRAILS } from './config.js';

export const getSavedTrailId = () => {
  const saved = localStorage.getItem('activeTrailId');
  return TRAILS[saved] ? saved : DEFAULT_TRAIL_ID;
};

// Shared state for data
export const state = {
  trail: TRAILS[getSavedTrailId()],
  waterSources: [],
  towns: [],
  allWaypoints: [],
  routeGeoJson: null,
  elevationProfile: null,
  currentMile: 0,
  loopLength: 0,  // for loop trails: mile where the route closes back on its start (0 = not a loop)
  categories: {
    'water-reliable': [],
    'water-other': [],
    towns: [],
    navigation: [],
    toilets: []
  },
  visibleCategories: {
    'water-reliable': true,
    'water-other': true,
    towns: true,
    navigation: false,
    toilets: true,
    sections: true
  }
};

export const setActiveTrail = (trailId) => {
  state.trail = TRAILS[trailId] || TRAILS[DEFAULT_TRAIL_ID];
  localStorage.setItem('activeTrailId', state.trail.id);
};

export const getSectionPoints = () => state.trail.sections;

export const getTrailStorageKey = (key) => `${state.trail.id}_${key}`;

const normalizeWaterRating = (rating) => {
  const match = String(rating || '').trim().toLowerCase().match(/^w([0-3])$/);
  return match ? `w${match[1]}` : null;
};

export const getWaterRating = (source) => {
  const explicit = normalizeWaterRating(source?.waterRating);
  if (explicit) return explicit;

  const text = [source?.landmark, source?.name, source?.details]
    .filter(Boolean)
    .join(' ');
  const match = text.match(/\bW\s*([0-3])(?:\s*-\s*[0-3])?\b/i);
  return match ? `w${match[1]}` : null;
};

export const getReliableWaterRatings = () => {
  const config = state.trail.waterReliability;
  if (!config) return [];

  const validRatings = new Set(config.ratings);
  try {
    const raw = localStorage.getItem(getTrailStorageKey('reliableWaterRatings'));
    if (raw !== null) {
      const saved = JSON.parse(raw);
      const normalized = saved
        .map(normalizeWaterRating)
        .filter(rating => validRatings.has(rating));
      return [...new Set(normalized)];
    }
  } catch (_) {
    // ignore invalid stored state
  }

  return [...config.defaultReliable];
};

export const saveReliableWaterRatings = (ratings) => {
  const config = state.trail.waterReliability;
  if (!config) return;

  const validRatings = new Set(config.ratings);
  const normalized = ratings
    .map(normalizeWaterRating)
    .filter(rating => validRatings.has(rating));
  localStorage.setItem(getTrailStorageKey('reliableWaterRatings'), JSON.stringify([...new Set(normalized)]));
};

export const isReliableWaterSource = (source) => {
  if (!state.trail.waterReliability) return source?.subcategory === 'reliable';
  return getReliableWaterRatings().includes(getWaterRating(source));
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

  if (!state.trail.data.elevationProfile) {
    const waypointProfile = state.allWaypoints
      .filter(point =>
        Number.isFinite(point.mile) &&
        Number.isFinite(point.elevation) &&
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lon)
      )
      .map(point => ({
        distance: point.mile,
        mile: point.mile,
        elevation: point.elevation,
        lat: point.lat,
        lon: point.lon
      }))
      .sort((a, b) => a.distance - b.distance);

    state.elevationProfile = waypointProfile.length >= 2 ? waypointProfile : null;
    return state.elevationProfile;
  }

  try {
    const response = await fetch(state.trail.data.elevationProfile);
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // [BUGS] Fixed: missing response.ok check before parsing JSON
    state.elevationProfile = await response.json();
    return state.elevationProfile;
  } catch (error) {
    console.error('Failed to load elevation profile:', error);
    return null;
  }
};

export const clearElevationProfile = () => {
  state.elevationProfile = null;
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

// Project point P onto segment AB (all in local mile coordinates).
// Returns perpendicular distance and interpolation factor t clamped to [0, 1].
const projectPointToSegmentMiles = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  }

  // Project P onto line AB, clamp t to [0,1] to stay on segment
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return { distance: Math.hypot(px - closestX, py - closestY), t };
};

const getTrackMile = (point) => {
  if (point && Number.isFinite(point.mile)) return point.mile;
  if (point && Number.isFinite(point.distance)) return point.distance;
  return null;
};

// Find mile marker from lat/lon coordinates.
// Uses perpendicular projection onto the trail polyline both for:
// - distance-from-trail, and
// - interpolated mile marker between adjacent trail points.
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

  // Calculate distance from trail by projecting the point onto the track.
  // Use the elevation profile (dense GPX track coords, ~0.1 mi spacing) if available,
  // otherwise fall back to waypoint segments (~0.9 mi spacing).
  const track = (state.elevationProfile && state.elevationProfile.length >= 2)
    ? state.elevationProfile
    : state.allWaypoints;

  const p = toLocalMiles(lat, lon, lat);
  let minDist = Infinity;
  let projectedMile = null;

  if (track.length >= 2) {
    for (let i = 0; i < track.length - 1; i++) {
      const a = toLocalMiles(track[i].lat, track[i].lon, lat);
      const b = toLocalMiles(track[i + 1].lat, track[i + 1].lon, lat);
      const projection = projectPointToSegmentMiles(p.x, p.y, a.x, a.y, b.x, b.y);

      if (projection.distance < minDist) {
        minDist = projection.distance;
        const startMile = getTrackMile(track[i]);
        const endMile = getTrackMile(track[i + 1]);
        if (Number.isFinite(startMile) && Number.isFinite(endMile)) {
          projectedMile = startMile + (endMile - startMile) * projection.t;
        } else {
          projectedMile = null;
        }
      }
    }
  } else {
    // Single point — distance to it
    minDist = degreesToMiles(lat - track[0].lat, lon - track[0].lon, lat);
    projectedMile = getTrackMile(track[0]);
  }

  // Fallback to nearest waypoint mile if track points lack mile metadata.
  if (!Number.isFinite(projectedMile)) {
    let closestWp = state.allWaypoints[0];
    let minWpDist = Math.hypot(lon - closestWp.lon, lat - closestWp.lat);

    for (const wp of state.allWaypoints) {
      const dist = Math.hypot(lon - wp.lon, lat - wp.lat);
      if (dist < minWpDist) {
        minWpDist = dist;
        closestWp = wp;
      }
    }

    projectedMile = closestWp.mile;
  }

  return {
    mile: projectedMile,
    distanceFromTrail: minDist
  };
};

// Loop closure mile for loop trails (0 when not a loop). Set at data load.
export const getLoopLength = () => (state.trail.loop ? state.loopLength : 0);

// Trail distance from one mile marker to another in the direction of travel.
// On a loop, a destination "behind" the current mile wraps forward around the
// closure instead of reading as a negative distance.
export const trailDistanceAhead = (fromMile, toMile) => {
  let d = toMile - fromMile;
  const loop = getLoopLength();
  if (loop > 0 && d < 0) d += loop;
  return d;
};

// Find the next item ahead in a mile-sorted list, wrapping to the first item
// on a loop trail when nothing remains ahead before the closure.
const findNextAhead = (items, mile, predicate = () => true) => {
  const ahead = items.find(item => item.mile > mile + MILE_EPSILON && predicate(item));
  if (ahead) return ahead;
  if (getLoopLength() > 0) return items.find(predicate) || null;
  return null;
};

// Find next water source after given mile
export const findNextWater = (mile) => findNextAhead(state.waterSources, mile);

// Find next reliable water source after given mile
export const findNextReliableWater = (mile) => findNextAhead(state.waterSources, mile, isReliableWaterSource);

// Find next non-reliable water source after given mile
export const findNextOtherWater = (mile) => findNextAhead(state.waterSources, mile, s => !isReliableWaterSource(s));

// Find next town after given mile
export const findNextTown = (mile) => findNextAhead(state.towns, mile);

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
