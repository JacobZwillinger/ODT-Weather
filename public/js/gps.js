// GPS tracking module
import { findMileFromCoords } from './utils.js';
import { showMapInfo } from './map.js';

// GPS state
let watchId = null;
let isGpsActive = false;
let lastPosition = null;
// [BUGS] Fixed: removed unused locationMarker and accuracyCircle variables (map.js manages its own)
let onPositionUpdate = null;

// Compass heading state
let onHeadingUpdate = null;
let compassHeading = null;  // current heading in degrees (0 = north, clockwise)

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

// Handle successful position update
const handlePositionSuccess = async (position) => {
  const { latitude, longitude, accuracy } = position.coords;

  // Skip update if we haven't moved enough
  if (lastPosition) {
    const distance = getDistanceMeters(
      lastPosition.latitude, lastPosition.longitude,
      latitude, longitude
    );
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
    // iOS: webkitCompassHeading is degrees from north, already corrected for screen orientation
    heading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha != null) {
    // Android (absolute mode): alpha is degrees counter-clockwise from north
    // Convert to clockwise bearing
    heading = (360 - event.alpha) % 360;
  } else if (event.alpha != null) {
    // Non-absolute fallback — less reliable but better than nothing
    heading = (360 - event.alpha) % 360;
  }

  if (heading !== null) {
    compassHeading = heading;
    if (onHeadingUpdate) {
      onHeadingUpdate(heading);
    }
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

  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
};

const stopCompass = () => {
  window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
  compassHeading = null;
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

// Initialize GPS button
export const initGpsButton = () => {
  const btn = document.getElementById('btnGpsToggle');
  if (btn) {
    btn.addEventListener('click', toggleGps);
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
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  }
};
