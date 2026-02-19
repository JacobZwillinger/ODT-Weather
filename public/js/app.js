// Main application entry point
import { state, loadToggleState, saveToggleState } from './utils.js';
import { loadForecasts } from './weather.js';
import { initModals, showWaypointDetail, showWaterDetail, showTownDetail } from './modals.js';
import { showMapInfo, scheduleMapInit, toggleCategoryLayer, swapCategoryData, onMapReady, resetMapView, saveMapView, restoreMapView } from './map.js';
import { TEST_DATA } from './test-data.js';
import { initGpsButton, getLastPosition } from './gps.js';
import { renderElevationChart, jumpToCurrentMile } from './elevation.js';
import { getMoonData } from './moon.js';
import { sectionPoints } from './config.js';

// Safe fetch with error handling
const safeFetch = async (url, defaultValue = []) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return defaultValue;
    }
    return await response.json();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    return defaultValue;
  }
};

// Escape HTML to prevent XSS
const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// ========== Overlay Management ==========

const openOverlay = (id) => {
  document.getElementById(id).hidden = false;
};

const closeAllOverlays = () => {
  document.querySelectorAll('.fullscreen-overlay').forEach(o => { o.hidden = true; });
};

// Reset browser viewport zoom back to 1 after user may have pinched-zoomed inside an overlay.
// Works by briefly locking then releasing maximum-scale, which forces Chrome/Safari to snap back.
const resetViewportScale = () => {
  const meta = document.querySelector('meta[name=viewport]');
  if (!meta) return;
  const original = meta.content;
  meta.content = original + ', maximum-scale=1';
  requestAnimationFrame(() => { meta.content = original; });
};

// Open the waypoints overlay to a specific filter — used by bottom bar cards
// Sets that filter as the sole active one
export const openWaypointFilter = (filter) => {
  saveMapView();
  openOverlay('waypointListOverlay');
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
  if (btn) btn.classList.add('active');
  renderWaypointList([filter]);
};

// ========== Waypoint List ==========

const getItemsForFilter = (filter) => {
  switch (filter) {
    case 'reliable-water':
      return state.waterSources
        .filter(s => s.subcategory === 'reliable')
        .map(s => ({ ...s, type: 'water' }));
    case 'other-water':
      return state.waterSources
        .filter(s => s.subcategory !== 'reliable')
        .map(s => ({ ...s, type: 'water' }));
    case 'towns':
      return state.towns.map(t => ({ ...t, type: 'towns' }));
    case 'navigation':
      return (state.categories.navigation || []).map(n => ({ ...n, type: 'navigation' }));
    case 'toilets':
      return (state.categories.toilets || []).map(t => ({ ...t, type: 'toilets' }));
    case 'sections':
      return sectionPoints.map(s => ({
        name: s.name, mile: s.mile, lat: s.lat, lon: s.lon,
        type: 'sections', subcategory: null, landmark: null
      }));
    default:
      return [];
  }
};

const renderWaypointList = (activeFilters) => {
  const container = document.getElementById('waypointListContent');

  // Merge items from all active filters, dedupe by name
  const seen = new Set();
  let items = [];
  for (const filter of activeFilters) {
    for (const item of getItemsForFilter(filter)) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        items.push(item);
      }
    }
  }

  // Sort by mile
  items.sort((a, b) => a.mile - b.mile);

  if (items.length === 0) {
    container.innerHTML = '<div class="waypoint-list-empty">No waypoints found</div>';
    return;
  }

  container.innerHTML = items.map(item => {
    // Pick bar color class based on type + subcategory
    const barClass = item.type === 'water'
      ? (item.subcategory === 'reliable' ? 'bar-water-reliable' : 'bar-water-other')
      : `bar-${item.type}`;

    // Subcategory label with color
    const subClass = {
      reliable: 'sub-reliable', seasonal: 'sub-seasonal', unreliable: 'sub-unreliable',
      full: 'sub-full', limited: 'sub-limited'
    }[item.subcategory] || 'sub-other';
    const subLabel = item.subcategory
      ? `<div class="waypoint-list-sub ${subClass}">${escapeHtml(item.subcategory)}</div>`
      : '';

    return `
    <div class="waypoint-list-item" data-name="${escapeHtml(item.name)}" data-type="${item.type}" data-lat="${item.lat}" data-lon="${item.lon}">
      <div class="waypoint-list-bar ${barClass}"></div>
      <div class="waypoint-list-content">
        <div class="waypoint-list-header">
          <span class="waypoint-list-name">${escapeHtml(item.name)}</span>
          <span class="waypoint-list-mile">Mi ${item.mile.toFixed(1)}</span>
        </div>
        ${subLabel}
        ${item.landmark ? `<div class="waypoint-list-desc">${escapeHtml(item.landmark)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Click handler: fly directly to waypoint on map
  container.querySelectorAll('.waypoint-list-item').forEach(el => {
    el.addEventListener('click', () => {
      const lat = parseFloat(el.dataset.lat);
      const lon = parseFloat(el.dataset.lon);
      if (!isNaN(lat) && !isNaN(lon) && window._odtMap) {
        closeAllOverlays();
        resetViewportScale();
        window._odtMap.flyTo({ center: [lon, lat], zoom: 14, duration: 800 });
      }
    });
  });
};

// ========== Settings Popover ==========

const initSettingsPopover = () => {
  const layersBtn = document.getElementById('btnKebabLayers');
  const popover = document.getElementById('settingsPopover');

  layersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !popover.hidden;
    popover.hidden = isOpen;
    if (!isOpen) positionSettingsPopover();
  });

  // Sync button UI with saved state
  const toggleButtons = popover.querySelectorAll('.category-toggle-btn');
  toggleButtons.forEach(btn => {
    const category = btn.dataset.category;
    if (state.visibleCategories[category]) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  // Category toggle handlers — stopPropagation so clicks don't close the popover
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      state.visibleCategories[category] = !state.visibleCategories[category];
      btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', String(state.visibleCategories[category]));
      toggleCategoryLayer(category, state.visibleCategories[category]);
      saveToggleState();
    });
  });

  // Close popover when clicking outside (but not when clicking inside it or its trigger)
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !layersBtn.contains(e.target)) {
      popover.hidden = true;
    }
  });
};

// Position a panel to the right of a given button
const positionToRightOf = (btn, panel) => {
  const rect = btn.getBoundingClientRect();
  panel.style.left = (rect.right + 10) + 'px';
  panel.style.top = rect.top + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
};

const positionSettingsPopover = () => {
  positionToRightOf(
    document.getElementById('btnKebabLayers'),
    document.getElementById('settingsPopover')
  );
};

const positionApiPanel = () => {
  positionToRightOf(
    document.getElementById('btnKebabApiKey'),
    document.getElementById('kebabApiPanel')
  );
};

// ========== Test Mode Adapter ==========

// Snapshot of real ODT data — stashed after init so test mode can restore it
let realData = null;

// Build the DC test dataset in the same shape that state expects
const buildTestDataset = () => ({
  allWaypoints: TEST_DATA.waypoints,
  waterSources: TEST_DATA.water,
  towns: TEST_DATA.towns,
  categories: {
    'water-reliable': TEST_DATA.water.filter(s => s.subcategory === 'reliable'),
    'water-other':    TEST_DATA.water.filter(s => s.subcategory !== 'reliable'),
    towns:            TEST_DATA.towns,
    navigation:       [],
    toilets:          [],
  },
});

// Adapter: atomically swap state + live map GeoJSON sources
const applyDataset = (dataset) => {
  state.allWaypoints = dataset.allWaypoints;
  state.waterSources = dataset.waterSources;
  state.towns        = dataset.towns;
  state.categories   = dataset.categories;
  for (const [cat, data] of Object.entries(dataset.categories)) {
    swapCategoryData(cat, data);
  }
  showMapInfo(0);
};

// ========== Kebab Menu ==========

const closeKebabMenu = () => {
  const subButtons = document.getElementById('kebabSubButtons');
  const apiPanel = document.getElementById('kebabApiPanel');
  const settingsPopover = document.getElementById('settingsPopover');
  const btn = document.getElementById('btnKebab');
  subButtons.hidden = true;
  apiPanel.hidden = true;
  settingsPopover.hidden = true;
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
};

const initKebabMenu = () => {
  const btn = document.getElementById('btnKebab');
  const subButtons = document.getElementById('kebabSubButtons');
  const apiPanel = document.getElementById('kebabApiPanel');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKeyHint = document.getElementById('apiKeyHint');
  const saveBtn = document.getElementById('btnSaveApiKey');
  const testModeBtn = document.getElementById('btnKebabTestMode');
  const aboutBtn = document.getElementById('btnKebabAbout');
  const apiKeyBtn = document.getElementById('btnKebabApiKey');

  // Load saved API key
  const savedKey = localStorage.getItem('pirateweatherApiKey') || '';
  if (savedKey) {
    apiKeyInput.value = savedKey;
    apiKeyHint.textContent = 'Custom key active';
  }

  // Load test mode state
  const testModeActive = localStorage.getItem('testMode') === 'true';
  testModeBtn.setAttribute('aria-pressed', String(testModeActive));
  testModeBtn.classList.toggle('active', testModeActive);

  // Main kebab button: toggle sub-buttons
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !subButtons.hidden;
    if (isOpen) {
      closeKebabMenu();
    } else {
      subButtons.hidden = false;
      apiPanel.hidden = true;
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  // API Key sub-button: toggle the API panel (positioned to the right)
  apiKeyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !apiPanel.hidden;
    apiPanel.hidden = isOpen;
    if (!isOpen) positionApiPanel();
  });

  // Save API key
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('pirateweatherApiKey', key);
      apiKeyHint.textContent = 'Saved!';
    } else {
      localStorage.removeItem('pirateweatherApiKey');
      apiKeyHint.textContent = 'Cleared — using default key';
    }
    setTimeout(() => {
      apiKeyHint.textContent = key ? 'Custom key active' : '';
    }, 2000);
  });

  // Test mode sub-button — swaps state + map sources between Oregon and DC fixtures
  testModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = testModeBtn.getAttribute('aria-pressed') === 'true';
    const next = !isActive;
    testModeBtn.setAttribute('aria-pressed', String(next));
    testModeBtn.classList.toggle('active', next);
    localStorage.setItem('testMode', String(next));

    if (next) {
      applyDataset(buildTestDataset());
      window._odtMap?.flyTo({ center: [-77.0148, 38.8728], zoom: 16, duration: 1200 });
    } else {
      if (realData) applyDataset(realData);
      window._odtMap?.flyTo({ center: [-120.5, 43.5], zoom: 8, duration: 1200 });
    }
  });

  // About sub-button — open info modal
  aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeKebabMenu();
    document.getElementById('infoModal').classList.add('visible');
  });

  // Close info modal
  document.getElementById('closeInfoModal').addEventListener('click', () => {
    document.getElementById('infoModal').classList.remove('visible');
  });

  // Close when clicking outside the kebab group
  document.addEventListener('click', (e) => {
    const group = document.getElementById('kebabGroup');
    const apiPanelEl = document.getElementById('kebabApiPanel');
    if (subButtons.hidden && apiPanelEl.hidden) return;
    if (!group.contains(e.target) && !apiPanelEl.contains(e.target)) {
      closeKebabMenu();
    }
  });
};

// ========== Initialize UI ==========

const initUI = () => {
  // Top-right: Elevation button
  document.getElementById('btnElevation').addEventListener('click', () => {
    saveMapView();
    openOverlay('elevationOverlay');
    // Re-render chart at full size after overlay is visible
    requestAnimationFrame(() => {
      renderElevationChart(state.currentMile, 'mapElevationChart');
    });
  });

  // Elevation overlay: jump-to-current-location button
  document.getElementById('btnElevJump').addEventListener('click', () => {
    jumpToCurrentMile();
  });

  // Top-right: Weather button
  document.getElementById('btnWeather').addEventListener('click', () => {
    saveMapView();
    openOverlay('weatherOverlay');
  });

  // Moon panel
  const moonPanel = document.getElementById('moonPanel');
  const moonPanelContent = document.getElementById('moonPanelContent');
  document.getElementById('btnMoon').addEventListener('click', () => {
    if (!moonPanel.hidden) {
      moonPanel.hidden = true;
      return;
    }
    // Use central ODT location (Burns, OR area) and current timezone
    const lat = 43.5;
    const lon = -118.9;
    const now = new Date();
    const tzOffsetMin = now.getTimezoneOffset() * -1; // JS returns negative offset, we need positive for west
    const moonData = getMoonData(now, lat, lon, tzOffsetMin);
    moonPanelContent.innerHTML = `
      <div class="moon-panel-inner">
        <div class="moon-phase-row">
          <span class="moon-phase-emoji">${moonData.emoji}</span>
          <div class="moon-phase-info">
            <div class="moon-phase-name">${moonData.name}</div>
            <div class="moon-phase-illumination">${moonData.illumination}% illuminated</div>
            <div class="moon-phase-age">Day ${moonData.age} of 29.5</div>
          </div>
        </div>
        <div class="moon-times-row">
          <div class="moon-time-card">
            <div class="moon-time-label">Moonrise</div>
            <div class="moon-time-value">${moonData.rise}</div>
          </div>
          <div class="moon-time-card">
            <div class="moon-time-label">Moonset</div>
            <div class="moon-time-value">${moonData.set}</div>
          </div>
        </div>
        <div class="moon-location-note">Times approximate for ODT corridor (Burns, OR area) · Your local time</div>
        <div class="moon-panel-close-row">
          <button class="moon-panel-close" id="btnMoonClose">Close</button>
        </div>
      </div>
    `;
    moonPanel.hidden = false;
    document.getElementById('btnMoonClose').addEventListener('click', () => {
      moonPanel.hidden = true;
    });
  });

  // Hide moon panel when weather overlay closes
  document.querySelectorAll('#weatherOverlay .overlay-close').forEach(btn => {
    btn.addEventListener('click', () => { moonPanel.hidden = true; });
  });

  // Top-right: GPS Center button
  document.getElementById('btnGpsCenter').addEventListener('click', () => {
    const pos = getLastPosition();
    if (pos && window._odtMap) {
      window._odtMap.flyTo({ center: [pos.longitude, pos.latitude], zoom: 14, duration: 1000 });
    }
  });

  // Bottom-right: Waypoint list button
  document.getElementById('btnWaypointList').addEventListener('click', () => openWaypointFilter('reliable-water'));

  // Bottom bar cards → open waypoints overlay with correct filter
  [
    { id: 'nextReliableWaterCard', filter: 'reliable-water' },
    { id: 'nextOtherWaterCard',    filter: 'other-water' },
    { id: 'nextTownCard',          filter: 'towns' },
    { id: 'nextSectionCard',       filter: 'sections' },
  ].forEach(({ id, filter }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => openWaypointFilter(filter));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWaypointFilter(filter); }
    });
  });

  // Top-left: Kebab menu
  initKebabMenu();

  // Bottom-right: Settings popover
  initSettingsPopover();

  // Close buttons for all overlays
  document.querySelectorAll('.overlay-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.fullscreen-overlay').hidden = true;
      restoreMapView();
      resetViewportScale();
    });
  });

  // Filter bar handlers — multi-select toggle
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wasActive = btn.classList.contains('active');
      btn.classList.toggle('active', !wasActive);
      // Always keep at least one active
      const activeFilters = [...document.querySelectorAll('.filter-btn.active')]
        .map(b => b.dataset.filter);
      if (activeFilters.length === 0) {
        btn.classList.add('active');
        renderWaypointList([btn.dataset.filter]);
      } else {
        renderWaypointList(activeFilters);
      }
    });
  });

  // View on Map button
  const viewOnMapBtn = document.getElementById('viewOnMapBtn');
  viewOnMapBtn.addEventListener('click', () => {
    const lat = parseFloat(viewOnMapBtn.dataset.lat);
    const lon = parseFloat(viewOnMapBtn.dataset.lon);

    if (!isNaN(lat) && !isNaN(lon) && window._odtMap) {
      // Close all overlays and modals
      closeAllOverlays();
      document.getElementById('waypointModal').classList.remove('visible');

      // Fly to location
      window._odtMap.flyTo({ center: [lon, lat], zoom: 14, duration: 1000 });
    }
  });

  // Escape key closes overlays
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const hadOpenOverlay = document.querySelectorAll('.fullscreen-overlay:not([hidden])').length > 0;
      document.querySelectorAll('.fullscreen-overlay:not([hidden])').forEach(o => {
        o.hidden = true;
      });
      if (hadOpenOverlay) { restoreMapView(); resetViewportScale(); }
      // Close info modal if open
      document.getElementById('infoModal').classList.remove('visible');
      // Close kebab sub-buttons / panels
      closeKebabMenu();
    }
  });
};

// ========== App Init ==========

const init = async () => {
  try {
    // Load saved toggle preferences
    loadToggleState();

    // Load all data in parallel with error handling
    const [waypoints, water, townData, navigation, toilets] = await Promise.all([
      safeFetch('waypoints.json', []),
      safeFetch('water.json', []),
      safeFetch('towns.json', []),
      safeFetch('navigation.json', []),
      safeFetch('toilets.json', [])
    ]);

    // Update shared state
    state.allWaypoints = waypoints;
    state.waterSources = water;
    state.towns = townData;
    state.categories = {
      'water-reliable': water.filter(s => s.subcategory === 'reliable'),
      'water-other': water.filter(s => s.subcategory !== 'reliable'),
      towns: townData,
      navigation,
      toilets
    };

    console.log('Loaded', state.allWaypoints.length, 'waypoints,', water.length, 'water,', townData.length, 'towns,', navigation.length, 'nav,', toilets.length, 'toilets');

    // Stash real data so test mode can restore it
    realData = {
      allWaypoints: state.allWaypoints,
      waterSources: state.waterSources,
      towns: state.towns,
      categories: { ...state.categories }
    };

    // If test mode was left on from a previous session, swap data once map sources exist
    if (localStorage.getItem('testMode') === 'true') {
      onMapReady(() => applyDataset(buildTestDataset()));
    }

    // Initialize info bar with mile 0
    showMapInfo(0);
  } catch (err) {
    console.error('Failed to initialize app:', err);
  }

  // Initialize modals
  initModals();

  // Initialize GPS button
  initGpsButton();

  // Initialize UI (overlays, buttons, settings)
  initUI();

  // Load weather forecasts
  loadForecasts();

  // Initialize map (after small delay for DOM)
  scheduleMapInit();
};

// Start the app
init();
