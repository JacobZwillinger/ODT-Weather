// GPS tracking module
import { findMileFromCoords } from './utils.js';
import { showMapInfo, updateDailyMiles } from './map.js';

// GPS state
let watchId = null;
let isGpsActive = false;
let lastPosition = null;
// [BUGS] Fixed: removed unused locationMarker and accuracyCircle variables (map.js manages its own)
let onPositionUpdate = null;

// Compass heading state
let onHeadingUpdate = null;
let compassHeading = null;  // current heading in degrees (0 = north, clockwise)
let smoothedHeading = null;
let lastCourseHeading = null;
let lastSpeedMps = 0;

// GPS options optimized for hiking
const GPS_OPTIONS = {
  enableHighAccuracy: true,  // Use GPS for best accuracy in remote areas
  maximumAge: 60000,         // Accept cached position up to 1 minute old
  timeout: 30000             // Wait up to 30s for a fix
};

// Minimum distance (meters) to trigger an update - reduces battery usage
const MIN_UPDATE_DISTANCE = 10;

// Calculate distance between two points in meters (Haversine)
const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeHeading = (deg) => ((deg % 360) + 360) % 360;

// Blend angles using shortest-turn interpolation on a circle.
const blendHeading = (fromDeg, toDeg, weight) => {
  const from = normalizeHeading(fromDeg);
  const to = normalizeHeading(toDeg);
  const delta = ((to - from + 540) % 360) - 180;
  return normalizeHeading(from + (delta * weight));
};

const getScreenAngle = () => {
  if (screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle;
  }
  if (typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
};

// Initial bearing from point A to B in degrees clockwise from true north.
const getBearing = (lat1, lon1, lat2, lon2) => {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return normalizeHeading((Math.atan2(y, x) * 180 / Math.PI));
};

const pushHeadingUpdate = (sensorHeading) => {
  let target = normalizeHeading(sensorHeading);

  // Blend in course-over-ground when moving; this dampens magnetometer drift.
  if (lastCourseHeading != null) {
    let courseWeight = 0;
    if (lastSpeedMps >= 2.0) {
      courseWeight = 0.75;
    } else if (lastSpeedMps >= 1.0) {
      courseWeight = 0.45;
    }
    if (courseWeight > 0) {
      target = blendHeading(target, lastCourseHeading, courseWeight);
    }
  }

  // Low-pass filter on heading; lighter smoothing at higher speed for responsiveness.
  const smoothWeight = lastSpeedMps >= 1.5 ? 0.45 : 0.2;
  smoothedHeading = smoothedHeading == null
    ? target
    : blendHeading(smoothedHeading, target, smoothWeight);

  compassHeading = smoothedHeading;
  if (onHeadingUpdate) {
    onHeadingUpdate(compassHeading);
  }
};

// Handle successful position update
const handlePositionSuccess = async (position) => {
  const { latitude, longitude, accuracy } = position.coords;

  // Update movement-derived heading data before any early return.
  if (lastPosition) {
    const distance = getDistanceMeters(
      lastPosition.latitude, lastPosition.longitude,
      latitude, longitude
    );
    const dtSeconds = Math.max(0.1, (position.timestamp - lastPosition.timestamp) / 1000);
    const derivedSpeed = distance / dtSeconds;

    const sensorSpeed = Number.isFinite(position.coords.speed) ? position.coords.speed : null;
    lastSpeedMps = sensorSpeed != null && sensorSpeed >= 0 ? sensorSpeed : derivedSpeed;

    if (distance >= 3 && dtSeconds > 0) {
      const gpsHeading = Number.isFinite(position.coords.heading) && position.coords.heading >= 0
        ? position.coords.heading
        : null;
      lastCourseHeading = gpsHeading != null
        ? normalizeHeading(gpsHeading)
        : getBearing(lastPosition.latitude, lastPosition.longitude, latitude, longitude);
    }

    // Skip UI updates if we haven't moved enough.
    if (distance < MIN_UPDATE_DISTANCE) {
      return;
    }
  }

  lastPosition = { latitude, longitude, accuracy, timestamp: position.timestamp };

  // Notify listeners (map marker update)
  if (onPositionUpdate) {
    onPositionUpdate(latitude, longitude, accuracy);
  }

  // Find mile marker and update info panel
  const result = await findMileFromCoords(latitude, longitude);
  showMapInfo(result.mile, result.distanceFromTrail);
  updateDailyMiles(result.mile);
};

// Handle GPS errors
const handlePositionError = (error) => {
  let message;
  switch (error.code) {
    case error.PERMISSION_DENIED:
      message = 'Location permission denied. Please enable location access in your browser settings.';
      break;
    case error.POSITION_UNAVAILABLE:
      message = 'Location unavailable. Make sure GPS is enabled on your device.';
      break;
    case error.TIMEOUT:
      message = 'Location request timed out. Try moving to an area with better GPS signal.';
      break;
    default:
      message = 'Unable to get location.';
  }
  console.error('GPS Error:', message, error);

  // Show error to user
  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = 'GPS Error';
    statusEl.className = 'gps-status error';
  }
};

// Handle device orientation event
const handleDeviceOrientation = (event) => {
  let heading = null;

  if (event.webkitCompassHeading != null) {
    // iOS: already corrected heading from north.
    heading = event.webkitCompassHeading;
  } else if (event.alpha != null) {
    // Android/other: compensate alpha with screen rotation.
    // alpha increases counter-clockwise; convert to clockwise compass bearing.
    const screenAngle = getScreenAngle();
    heading = normalizeHeading((360 - event.alpha) + screenAngle);
  }

  if (heading != null) {
    pushHeadingUpdate(heading);
  }
};

// Request DeviceOrientation permission (required on iOS 13+) and start listening
const startCompass = async () => {
  if (!window.DeviceOrientationEvent) return;

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ requires explicit permission
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return;
    } catch (e) {
      console.warn('DeviceOrientation permission denied:', e);
      return;
    }
  }

  // deviceorientationabsolute is preferred when supported; keep fallback listener too.
  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
};

const stopCompass = () => {
  window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
  window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
  compassHeading = null;
  smoothedHeading = null;
  if (onHeadingUpdate) onHeadingUpdate(null);
};

// Start GPS tracking
export const startGps = () => {
  if (!navigator.geolocation) {
    console.error('Geolocation not supported');
    alert('Your browser does not support GPS location.');
    return false;
  }

  if (isGpsActive) return true;

  watchId = navigator.geolocation.watchPosition(
    handlePositionSuccess,
    handlePositionError,
    GPS_OPTIONS
  );

  isGpsActive = true;
  localStorage.setItem('gpsEnabled', 'true');
  updateGpsButtonState(true);
  startCompass();

  // Update status
  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = 'Acquiring...';
    statusEl.className = 'gps-status acquiring';
  }

  return true;
};

// Stop GPS tracking
export const stopGps = () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  isGpsActive = false;
  lastPosition = null;
  lastCourseHeading = null;
  lastSpeedMps = 0;
  localStorage.setItem('gpsEnabled', 'false');
  updateGpsButtonState(false);
  stopCompass();

  // Update status
  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'gps-status';
  }

  // Remove marker from map
  if (onPositionUpdate) {
    onPositionUpdate(null, null, null);
  }
};

// Toggle GPS on/off
export const toggleGps = () => {
  if (isGpsActive) {
    stopGps();
  } else {
    startGps();
  }
  return isGpsActive;
};

// Update GPS button visual state
const updateGpsButtonState = (active) => {
  const btn = document.getElementById('btnGpsToggle');
  if (btn) {
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
};

// Get current GPS state
export const isGpsEnabled = () => isGpsActive;

// Get last known position
export const getLastPosition = () => lastPosition;

// Register callback for position updates (used by map to update marker)
export const setPositionUpdateCallback = (callback) => {
  onPositionUpdate = callback;
};

// Register callback for heading updates (used by map to rotate marker)
export const setHeadingUpdateCallback = (callback) => {
  onHeadingUpdate = callback;
};

// Get current compass heading
export const getCompassHeading = () => compassHeading;

// Check if click handlers should be active (disabled when GPS is active)
export const shouldAllowMapClicks = () => !isGpsActive;

// Initialize GPS button — defaults to ON unless user explicitly turned it off
export const initGpsButton = () => {
  const btn = document.getElementById('btnGpsToggle');
  if (btn) {
    btn.addEventListener('click', toggleGps);
  }

  // Auto-start GPS: default is ON; only skip if user explicitly set it to 'false'
  const saved = localStorage.getItem('gpsEnabled');
  if (saved !== 'false') {
    startGps();
  }
};

// Android lifecycle hooks — pause/resume GPS when app goes to background/foreground
// These are called from MainActivity.kt via evaluateJavascript()
let wasGpsActiveBeforePause = false;

window._gpsCleanup = () => {
  wasGpsActiveBeforePause = isGpsActive;
  if (isGpsActive) {
    // Stop GPS silently (don't reset button state or remove marker)
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
  }
};

window._gpsResume = () => {
  if (wasGpsActiveBeforePause && !watchId) {
    // Restart GPS watch silently
    watchId = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      GPS_OPTIONS
    );
    // Restart compass (no permission re-request needed on Android)
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  }
};
