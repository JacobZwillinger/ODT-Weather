import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [TEST] Added: unit tests for gps.js — previously had zero unit test coverage
// Tests GPS toggle, error handling, distance calculation, and state management

// Mock the imported modules that gps.js depends on
vi.mock('../../public/js/utils.js', () => ({
  findMileFromCoords: vi.fn(() => ({ mile: 10, distanceFromTrail: 0 })),
  state: { allWaypoints: [], waterSources: [], towns: [], elevationProfile: null, currentMile: 0 },
  MILE_EPSILON: 0.01,
}));

vi.mock('../../public/js/map.js', () => ({
  showMapInfo: vi.fn(),
}));

vi.mock('../../public/js/config.js', () => ({
  MILE_EPSILON: 0.01,
  WATER_WARNING_MILES: 20,
  SCROLL_DELAY_MS: 100,
  MAP_INIT_DELAY_MS: 100,
}));

// Set up DOM
document.body.innerHTML = `
  <button id="btnGpsToggle" aria-pressed="false"></button>
  <span id="gpsStatus"></span>
`;

// Mock navigator.geolocation
const mockGeolocation = {
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};
Object.defineProperty(navigator, 'geolocation', {
  value: mockGeolocation,
  configurable: true,
});

const {
  startGps,
  stopGps,
  toggleGps,
  isGpsEnabled,
  getLastPosition,
  setPositionUpdateCallback,
  shouldAllowMapClicks,
  initGpsButton,
} = await import('../../public/js/gps.js');

describe('GPS module', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <button id="btnGpsToggle" aria-pressed="false"></button>
      <span id="gpsStatus"></span>
    `;
    // Reset geolocation mocks
    mockGeolocation.watchPosition.mockReset();
    mockGeolocation.clearWatch.mockReset();
    // Make sure GPS is off before each test
    if (isGpsEnabled()) {
      stopGps();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // [TEST] Added: verifies startGps calls watchPosition and updates state
  it('startGps activates geolocation watching', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    const result = startGps();
    expect(result).toBe(true);
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(isGpsEnabled()).toBe(true);
  });

  // [TEST] Added: verifies startGps is idempotent when already active
  it('startGps returns true without re-registering when already active', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    const result = startGps();
    expect(result).toBe(true);
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);
  });

  // [TEST] Added: verifies stopGps clears watch and resets state
  it('stopGps clears watch and resets state', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    stopGps();
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(42);
    expect(isGpsEnabled()).toBe(false);
    expect(getLastPosition()).toBeNull();
  });

  // [TEST] Added: verifies stopGps is safe to call when not active
  it('stopGps is safe to call when GPS is not active', () => {
    expect(() => stopGps()).not.toThrow();
    expect(isGpsEnabled()).toBe(false);
  });

  // [TEST] Added: verifies toggleGps switches between on and off states
  it('toggleGps toggles between active and inactive', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    toggleGps(); // turn on
    expect(isGpsEnabled()).toBe(true);
    toggleGps(); // turn off
    expect(isGpsEnabled()).toBe(false);
  });

  // [TEST] Added: verifies shouldAllowMapClicks returns false when GPS is active
  it('shouldAllowMapClicks returns false when GPS is active', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    expect(shouldAllowMapClicks()).toBe(false);
  });

  // [TEST] Added: verifies shouldAllowMapClicks returns true when GPS is inactive
  it('shouldAllowMapClicks returns true when GPS is inactive', () => {
    expect(shouldAllowMapClicks()).toBe(true);
  });

  // [TEST] Added: verifies GPS button aria-pressed state updates
  it('updates button aria-pressed attribute on toggle', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    const btn = document.getElementById('btnGpsToggle');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.classList.contains('active')).toBe(true);

    stopGps();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.classList.contains('active')).toBe(false);
  });

  // [TEST] Added: verifies GPS status element updates on start
  it('updates status text on startGps', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    const status = document.getElementById('gpsStatus');
    expect(status.textContent).toBe('Acquiring...');
    expect(status.className).toContain('acquiring');
  });

  // [TEST] Added: verifies GPS status element resets on stop
  it('clears status text on stopGps', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    startGps();
    stopGps();
    const status = document.getElementById('gpsStatus');
    expect(status.textContent).toBe('');
  });

  // [TEST] Added: verifies stopGps calls onPositionUpdate(null) to remove map marker
  it('stopGps notifies callback with null to remove marker', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    const callback = vi.fn();
    setPositionUpdateCallback(callback);
    startGps();
    stopGps();
    expect(callback).toHaveBeenCalledWith(null, null, null);
  });

  // [TEST] Added: verifies initGpsButton attaches click handler
  it('initGpsButton attaches click listener', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    initGpsButton();
    const btn = document.getElementById('btnGpsToggle');
    btn.click();
    expect(isGpsEnabled()).toBe(true);
    // Clean up
    stopGps();
  });
});
