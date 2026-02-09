import { describe, it, expect, beforeEach, vi } from 'vitest';

// [TEST] Added: unit tests for modals.js — previously had zero unit test coverage
// Tests showWaypointDetail, showWaterDetail, and showSourcesList logic

// Mock config
vi.mock('../../public/js/config.js', () => ({
  SCROLL_DELAY_MS: 0,
  MILE_EPSILON: 0.01,
  WATER_WARNING_MILES: 20,
  MAP_INIT_DELAY_MS: 100,
  CATEGORY_CONFIG: {
    water: { color: '#3b82f6', icon: 'water-icon', minZoom: 8, clusterMaxZoom: 14, clusterRadius: 35 },
    towns: { color: '#059669', icon: 'town-icon', minZoom: 7, clusterMaxZoom: 12, clusterRadius: 40 },
    navigation: { color: '#8b5cf6', icon: 'nav-icon', minZoom: 10, clusterMaxZoom: 14, clusterRadius: 30 },
    toilets: { color: '#f59e0b', icon: 'toilet-icon', minZoom: 8, clusterMaxZoom: 14, clusterRadius: 35 }
  }
}));

import { state } from '../../public/js/utils.js';

// Set up DOM before importing modals.js
const setupDOM = () => {
  document.body.innerHTML = `
    <button id="infoBtn"></button>
    <div id="infoModal"><button id="closeInfoModal"></button><div class="sources-modal-content"></div></div>
    <div id="sourcesModal"><button id="closeSourcesModal"></button><div id="sourcesModalTitle"></div><div id="sourcesList"></div></div>
    <div id="waypointModal"><button id="closeWaypointModal"></button><div id="waypointModalTitle"></div><div id="waypointDetail"></div></div>
    <div id="nextWaterCard"></div>
    <div id="nextTownCard"></div>
  `;
};

setupDOM();

const { showWaypointDetail, showWaterDetail, showTownDetail, showSourcesList, initModals } = await import('../../public/js/modals.js');

describe('showWaypointDetail', () => {
  beforeEach(() => {
    setupDOM();
    state.allWaypoints = [
      { name: 'WP001', mile: 10.5, lat: 43.0, lon: -120.0, landmark: 'Test Creek' },
      { name: 'WP002', mile: 25.0, lat: 43.1, lon: -120.1, landmark: '' },
    ];
  });

  // [TEST] Added: verifies waypoint modal opens with correct data when found by name
  it('opens modal with waypoint data when found by name', () => {
    const result = showWaypointDetail('WP001');
    expect(result).not.toBeNull();
    expect(result.name).toBe('WP001');

    const modal = document.getElementById('waypointModal');
    expect(modal.classList.contains('visible')).toBe(true);

    const title = document.getElementById('waypointModalTitle');
    expect(title.textContent).toBe('WP001');

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).toContain('10.5');
    expect(detail.textContent).toContain('Test Creek');
  });

  // [TEST] Added: verifies showWaypointDetail returns a waypoint even for unknown name
  // because the fallback coord search with null coords (which coerce to 0) finds the closest waypoint
  it('falls back to coordinate search when name not found (null coerces to 0)', () => {
    const result = showWaypointDetail('NONEXISTENT');
    // findWaypoint: name not found, falls to coord search with lat=null, lon=null
    // null coerces to 0 in arithmetic, so it finds the closest waypoint to (0, 0)
    expect(result).not.toBeNull();
  });

  // [TEST] Added: verifies fallback coordinate-based waypoint lookup
  it('finds waypoint by coordinates when name is null (legacy mode)', () => {
    const result = showWaypointDetail(43.0, -120.0);
    expect(result).not.toBeNull();
    expect(result.name).toBe('WP001');
  });

  // [TEST] Added: verifies description omitted when landmark is empty
  it('omits description when landmark is empty', () => {
    const result = showWaypointDetail('WP002');
    expect(result).not.toBeNull();

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).not.toContain('Description');
    expect(detail.textContent).toContain('Mile: 25.0');
  });

  // [TEST] Added: verifies returns null when allWaypoints is empty
  it('returns null when no waypoints loaded', () => {
    state.allWaypoints = [];
    const result = showWaypointDetail('WP001');
    expect(result).toBeNull();
  });
});

describe('showWaterDetail', () => {
  beforeEach(() => {
    setupDOM();
    state.waterSources = [
      {
        name: 'CV001',
        mile: 5.2,
        landmark: 'Spring Creek',
        details: 'reliable: seasonal flow',
        onTrail: true,
        offTrailDist: null,
        distToNext: 12
      },
      {
        name: 'CV002',
        mile: 15.0,
        landmark: '',
        details: 'unreliable: dry in summer',
        onTrail: false,
        offTrailDist: '0.3 mi W',
        distToNext: '-'
      },
    ];
  });

  // [TEST] Added: verifies water detail modal opens with correct data
  it('opens modal with water source data', () => {
    const result = showWaterDetail('CV001');
    expect(result).not.toBeNull();
    expect(result.name).toBe('CV001');

    const modal = document.getElementById('waypointModal');
    expect(modal.classList.contains('visible')).toBe(true);

    const title = document.getElementById('waypointModalTitle');
    expect(title.textContent).toBe('CV001');

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).toContain('5.2');
    expect(detail.textContent).toContain('reliable: seasonal flow');
    expect(detail.textContent).toContain('Next water: 12 mi');
  });

  // [TEST] Added: verifies off-trail distance shown for off-trail water sources
  it('shows off-trail distance for off-trail sources', () => {
    const result = showWaterDetail('CV002');
    expect(result).not.toBeNull();

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).toContain('0.3 mi W');
  });

  // [TEST] Added: verifies "Next water" not shown when distToNext is "-"
  it('does not show next water when distToNext is "-"', () => {
    const result = showWaterDetail('CV002');
    expect(result).not.toBeNull();

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).not.toContain('Next water');
  });

  // [TEST] Added: verifies returns null for non-existent water source name
  it('returns null when water source name not found', () => {
    const result = showWaterDetail('NONEXISTENT');
    expect(result).toBeNull();
  });

  // [TEST] Added: verifies returns null when name is null/undefined
  it('returns null when name is null', () => {
    const result = showWaterDetail(null);
    expect(result).toBeNull();
  });
});

describe('showTownDetail', () => {
  beforeEach(() => {
    setupDOM();
    state.towns = [
      { name: 'Paisley', mile: 160.5, landmark: 'walk through town of Paisley', services: 'full', offTrail: '6.2 miles W' },
      { name: 'Fields', mile: 438.0, landmark: 'Fields station', services: 'limited', offTrail: null },
    ];
    state.allWaypoints = [
      { name: 'WP001', mile: 10.5, lat: 43.0, lon: -120.0, landmark: 'Test Creek' },
    ];
  });

  it('opens modal with town data including services', () => {
    const result = showTownDetail('Paisley');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Paisley');

    const modal = document.getElementById('waypointModal');
    expect(modal.classList.contains('visible')).toBe(true);

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).toContain('160.5');
    expect(detail.textContent).toContain('full');
    expect(detail.textContent).toContain('6.2 miles W');
  });

  it('shows town without offTrail info when null', () => {
    const result = showTownDetail('Fields');
    expect(result).not.toBeNull();

    const detail = document.getElementById('waypointDetail');
    expect(detail.textContent).toContain('limited');
    expect(detail.textContent).not.toContain('Location:');
  });

  it('falls back to waypoint detail when town not found', () => {
    const result = showTownDetail('WP001');
    // Should fall back to showWaypointDetail
    expect(result).not.toBeNull();
    expect(result.name).toBe('WP001');
  });

  it('returns null when neither town nor waypoint found', () => {
    state.allWaypoints = [];
    const result = showTownDetail('NONEXISTENT');
    expect(result).toBeNull();
  });
});

describe('showSourcesList', () => {
  beforeEach(() => {
    setupDOM();
    state.currentMile = 10;
    state.waterSources = [
      { mile: 5, name: 'W1', landmark: 'Past Spring', details: 'good', distToNext: 10 },
      { mile: 12, name: 'W2', landmark: 'Near Creek', details: 'seasonal', distToNext: '-' },
      { mile: 50, name: 'W3', landmark: 'Far River', details: 'reliable', distToNext: 20 },
    ];
    state.towns = [
      { mile: 8, name: 'Past Town', services: 'gas, food', offTrail: '' },
      { mile: 25, name: 'Next Town', services: 'full resupply', offTrail: '2 mi W of trail' },
    ];
  });

  // [TEST] Added: verifies water sources list renders with correct count and highlights
  it('renders water sources list with correct highlighting', () => {
    showSourcesList('water');

    const modal = document.getElementById('sourcesModal');
    expect(modal.classList.contains('visible')).toBe(true);

    const title = document.getElementById('sourcesModalTitle');
    expect(title.textContent).toBe('Water Sources');

    const items = document.querySelectorAll('.source-item');
    expect(items.length).toBe(3);

    // Near Creek (mile 12) should be highlighted (|12-10| = 2 < 5)
    expect(items[1].classList.contains('highlight')).toBe(true);
    // Past Spring (mile 5) is exactly 5 miles away (|5-10| = 5, NOT < 5), so NOT highlighted
    expect(items[0].classList.contains('highlight')).toBe(false);
    // Far River (mile 50) should NOT be highlighted
    expect(items[2].classList.contains('highlight')).toBe(false);
  });

  // [TEST] Added: verifies town list renders with services and off-trail info
  it('renders towns list with services and off-trail info', () => {
    showSourcesList('town');

    const title = document.getElementById('sourcesModalTitle');
    expect(title.textContent).toBe('Towns & Resupply Points');

    const list = document.getElementById('sourcesList');
    expect(list.innerHTML).toContain('full resupply');
    expect(list.innerHTML).toContain('2 mi W of trail');
  });

  // [TEST] Added: verifies "Past" label shown for water sources behind current mile
  it('shows "Past" for sources behind current mile', () => {
    showSourcesList('water');

    const list = document.getElementById('sourcesList');
    expect(list.innerHTML).toContain('Past');
  });

  // [TEST] Added: verifies "mi ahead" label shown for sources ahead of current mile
  it('shows distance ahead for sources ahead of current mile', () => {
    showSourcesList('water');

    const list = document.getElementById('sourcesList');
    expect(list.innerHTML).toContain('mi ahead');
  });
});

describe('initModals', () => {
  beforeEach(() => {
    setupDOM();
  });

  // [TEST] Added: verifies modal close button and backdrop click handlers are wired up
  it('sets up close button handlers', () => {
    initModals();

    // Open the info modal
    document.getElementById('infoBtn').click();
    const infoModal = document.getElementById('infoModal');
    expect(infoModal.classList.contains('visible')).toBe(true);

    // Close via button
    document.getElementById('closeInfoModal').click();
    expect(infoModal.classList.contains('visible')).toBe(false);
  });

  // [TEST] Added: verifies backdrop click closes modal
  it('closes modal on backdrop click', () => {
    initModals();

    const waypointModal = document.getElementById('waypointModal');
    waypointModal.classList.add('visible');

    // Simulate clicking the modal backdrop (the modal element itself)
    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: waypointModal });
    waypointModal.dispatchEvent(event);

    expect(waypointModal.classList.contains('visible')).toBe(false);
  });

  // [TEST] Added: verifies clicking inside modal content does NOT close modal
  it('does not close modal when clicking content inside', () => {
    initModals();

    const waypointModal = document.getElementById('waypointModal');
    waypointModal.classList.add('visible');

    const title = document.getElementById('waypointModalTitle');
    // Simulate clicking on content inside the modal
    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: title });
    waypointModal.dispatchEvent(event);

    expect(waypointModal.classList.contains('visible')).toBe(true);
  });
});
