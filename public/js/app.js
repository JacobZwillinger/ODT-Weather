// Main application entry point
import { clearElevationProfile, getReliableWaterRatings, getSectionPoints, getTrailStorageKey, getWaterRating, isReliableWaterSource, saveReliableWaterRatings, setActiveTrail, state, loadToggleState, saveToggleState } from './utils.js';
import { loadForecasts } from './weather.js';
import { initModals, showWaypointDetail, showWaterDetail, showTownDetail } from './modals.js';
import { applyTrailMapData, showMapInfo, scheduleMapInit, toggleCategoryLayer, swapCategoryData, onMapReady, resetMapView, saveMapView, restoreMapView, getMileageLog, deleteMileageDay } from './map.js';
import { TEST_DATA } from './test-data.js';
import { initGpsButton, getLastPosition } from './gps.js';
import { renderElevationChart, jumpToCurrentMile, resetElevationChart } from './elevation.js';
import { getMoonData } from './moon.js';
import { TRAILS } from './config.js';

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

const buildDataset = (trail, waypoints, water, townData, navigation, toilets, routeGeoJson) => ({
  trail,
  allWaypoints: waypoints,
  routeGeoJson,
  waterSources: water,
  towns: townData,
  categories: {
    'water-reliable': water.filter(isReliableWaterSource),
    'water-other': water.filter(s => !isReliableWaterSource(s)),
    towns: townData,
    navigation,
    toilets
  }
});

const loadTrailDataset = async (trail) => {
  const [waypoints, water, townData, navigation, toilets, routeGeoJson] = await Promise.all([
    safeFetch(trail.data.waypoints, []),
    safeFetch(trail.data.water, []),
    safeFetch(trail.data.towns, []),
    safeFetch(trail.data.navigation, []),
    safeFetch(trail.data.toilets, []),
    trail.data.routeGeoJson ? safeFetch(trail.data.routeGeoJson, null) : Promise.resolve(null)
  ]);
  return buildDataset(trail, waypoints, water, townData, navigation, toilets, routeGeoJson);
};

const updateTrailChrome = () => {
  document.title = state.trail.name;
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', state.trail.shortName);

  const trailName = document.getElementById('activeTrailName');
  if (trailName) trailName.textContent = state.trail.shortName;

  const moonNote = document.querySelector('.moon-location-note');
  if (moonNote) moonNote.textContent = `Times approximate for ${state.trail.shortName} corridor`;

  const aboutSummary = document.getElementById('aboutTrailSummary');
  if (aboutSummary) aboutSummary.innerHTML = state.trail.about.summary;

  const aboutRouteSource = document.getElementById('aboutRouteSource');
  if (aboutRouteSource) aboutRouteSource.textContent = state.trail.about.routeSource;

  const aboutNumbers = document.getElementById('aboutTrailNumbers');
  if (aboutNumbers) {
    aboutNumbers.innerHTML = state.trail.about.byTheNumbers
      .map(item => `<li>${escapeHtml(item)}</li>`)
      .join('');
  }
};

// ========== Overlay Management ==========

const openOverlay = (id) => {
  history.pushState({ panel: id }, '');
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
        .filter(isReliableWaterSource)
        .map(s => ({ ...s, type: 'water' }));
    case 'other-water':
      return state.waterSources
        .filter(s => !isReliableWaterSource(s))
        .map(s => ({ ...s, type: 'water' }));
    case 'towns':
      return state.towns.map(t => ({ ...t, type: 'towns' }));
    case 'navigation':
      return (state.categories.navigation || []).map(n => ({ ...n, type: 'navigation' }));
    case 'toilets':
      return (state.categories.toilets || []).map(t => ({ ...t, type: 'toilets' }));
    case 'sections':
      return getSectionPoints().map(s => ({
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
      ? (isReliableWaterSource(item) ? 'bar-water-reliable' : 'bar-water-other')
      : `bar-${item.type}`;

    // Subcategory label with color
    const waterRating = item.type === 'water' ? getWaterRating(item) : null;
    const displaySubcategory = waterRating ? waterRating.toUpperCase() : item.subcategory;
    const subClass = {
      reliable: 'sub-reliable', seasonal: 'sub-seasonal', unreliable: 'sub-unreliable',
      full: 'sub-full', limited: 'sub-limited'
    }[item.subcategory] || (isReliableWaterSource(item) ? 'sub-reliable' : 'sub-other');
    const subLabel = displaySubcategory
      ? `<div class="waypoint-list-sub ${subClass}">${escapeHtml(displaySubcategory)}</div>`
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

const getActiveWaypointFilters = () => [...document.querySelectorAll('.filter-btn.active')].map(b => b.dataset.filter);

const refreshWaterClassification = () => {
  state.categories['water-reliable'] = state.waterSources.filter(isReliableWaterSource);
  state.categories['water-other'] = state.waterSources.filter(s => !isReliableWaterSource(s));
  swapCategoryData('water-reliable', state.categories['water-reliable']);
  swapCategoryData('water-other', state.categories['water-other']);
  showMapInfo(state.currentMile || 0);
  renderWaypointList(getActiveWaypointFilters());
};

const syncWaterReliabilityControls = () => {
  const panel = document.getElementById('waterReliabilityPanel');
  if (!panel) return;

  const config = state.trail.waterReliability;
  panel.hidden = !config;
  if (!config) return;

  const reliableRatings = new Set(getReliableWaterRatings());
  panel.querySelectorAll('.water-rating-btn').forEach(btn => {
    const rating = btn.dataset.waterRating;
    const active = reliableRatings.has(rating);
    btn.hidden = !config.ratings.includes(rating);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
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
    document.getElementById('trailPopover').hidden = true;
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

  popover.querySelectorAll('.water-rating-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const active = new Set(getReliableWaterRatings());
      const rating = btn.dataset.waterRating;
      if (active.has(rating)) {
        active.delete(rating);
      } else {
        active.add(rating);
      }
      saveReliableWaterRatings([...active]);
      syncWaterReliabilityControls();
      refreshWaterClassification();
    });
  });

  syncWaterReliabilityControls();

  // Close popover when clicking outside (but not when clicking inside it or its trigger)
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !layersBtn.contains(e.target)) {
      popover.hidden = true;
    }
  });
};

const isTestModeActive = () => localStorage.getItem('testMode') === 'true';

const syncTrailButtons = () => {
  const testActive = isTestModeActive();
  document.querySelectorAll('.trail-choice-btn').forEach(btn => {
    const id = btn.dataset.trailId;
    // Test choice lights up when test mode is on; real trail choices only when test is off.
    const active = id === 'test' ? testActive : (!testActive && id === state.trail.id);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  updateTrailChrome();
};

const toggleTestMode = () => {
  const next = !isTestModeActive();
  localStorage.setItem('testMode', String(next));
  if (next) {
    applyDataset(buildTestDataset());
    window._odtMap?.flyTo({ center: [-77.0148, 38.8728], zoom: 16, duration: 1200 });
  } else {
    if (realData) applyDataset(realData);
    window._odtMap?.flyTo({ center: [state.trail.center.lon, state.trail.center.lat], zoom: 8, duration: 1200 });
  }
  syncTrailButtons();
  closeKebabMenu();
};

const switchTrail = async (trailId) => {
  if (!TRAILS[trailId] || (trailId === state.trail.id && !isTestModeActive())) return;

  setActiveTrail(trailId);
  // Switching to a real trail always exits test mode.
  localStorage.setItem('testMode', 'false');
  clearElevationProfile();
  resetElevationChart();
  const dataset = await loadTrailDataset(state.trail);
  applyDataset(dataset);
  realData = {
    allWaypoints: state.allWaypoints,
    waterSources: state.waterSources,
    towns: state.towns,
    categories: { ...state.categories },
    routeGeoJson: state.routeGeoJson,
    trail: state.trail
  };
  await applyTrailMapData({ fitToTrail: true });
  syncTrailButtons();
  syncWaterReliabilityControls();
  renderWaypointList(getActiveWaypointFilters());
  loadForecasts();
  closeKebabMenu();
};

const initTrailSwitcher = () => {
  const trailBtn = document.getElementById('btnKebabTrail');
  const popover = document.getElementById('trailPopover');
  if (!trailBtn || !popover) return;

  trailBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !popover.hidden;
    popover.hidden = isOpen;
    document.getElementById('settingsPopover').hidden = true;
    if (!isOpen) positionToRightOf(trailBtn, popover);
  });

  popover.querySelectorAll('.trail-choice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.trailId;
      if (id === 'test') {
        toggleTestMode();
      } else {
        switchTrail(id);
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !trailBtn.contains(e.target)) {
      popover.hidden = true;
    }
  });

  syncTrailButtons();
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

// ========== Test Mode Adapter ==========

// Snapshot of real ODT data — stashed after init so test mode can restore it
let realData = null;

// Build the DC test dataset in the same shape that state expects
const buildTestDataset = () => ({
  trail: state.trail,
  allWaypoints: TEST_DATA.waypoints,
  routeGeoJson: null,
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
  if (dataset.trail) state.trail = dataset.trail;
  state.allWaypoints = dataset.allWaypoints;
  state.routeGeoJson = dataset.routeGeoJson || null;
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
  const settingsPopover = document.getElementById('settingsPopover');
  const trailPopover = document.getElementById('trailPopover');
  const btn = document.getElementById('btnKebab');
  subButtons.hidden = true;
  settingsPopover.hidden = true;
  trailPopover.hidden = true;
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
};

const initKebabMenu = () => {
  const btn = document.getElementById('btnKebab');
  const subButtons = document.getElementById('kebabSubButtons');
  const aboutBtn = document.getElementById('btnKebabAbout');

  // Main kebab button: toggle sub-buttons.
  // Test mode lives inside the trail popover now — see initTrailSwitcher / toggleTestMode.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !subButtons.hidden;
    if (isOpen) {
      closeKebabMenu();
    } else {
      subButtons.hidden = false;
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  // About sub-button — open info modal
  aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeKebabMenu();
    history.pushState({ panel: 'infoModal' }, '');
    document.getElementById('infoModal').classList.add('visible');
  });

  // Close info modal
  document.getElementById('closeInfoModal').addEventListener('click', () => {
    document.getElementById('infoModal').classList.remove('visible');
  });

  // Close when clicking outside the kebab group
  document.addEventListener('click', (e) => {
    const group = document.getElementById('kebabGroup');
    if (subButtons.hidden) return;
    if (!group.contains(e.target)) closeKebabMenu();
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
    const lat = state.trail.center.lat;
    const lon = state.trail.center.lon;
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
        <div class="moon-location-note">Times approximate for ${state.trail.shortName} corridor</div>
        <div class="moon-panel-close-row">
          <button class="moon-panel-close" id="btnMoonClose">Close</button>
        </div>
      </div>
    `;
    history.pushState({ panel: 'moon' }, '');
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
  initTrailSwitcher();

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

  // Daily miles block → open mileage log modal
  const renderMileageLog = (fromDate = '', toDate = '') => {
    const body = document.getElementById('mileageLogBody');
    if (!body) return;

    const log = getMileageLog(); // sorted ascending by date

    // Build today's live entry from current localStorage state
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayDateSaved = localStorage.getItem(getTrailStorageKey('dailyMilesDate')) === todayKey;
    const todayStart = parseFloat(localStorage.getItem(getTrailStorageKey('dailyMilesStart')));
    const todayEnd   = parseFloat(localStorage.getItem(getTrailStorageKey('dailyMilesEnd')));
    const todayMiles = (todayDateSaved && !isNaN(todayStart) && !isNaN(todayEnd))
      ? Math.max(0, todayEnd - todayStart)
      : null;

    // Apply date range filter to history
    let filtered = log;
    if (fromDate) filtered = filtered.filter(e => e.date >= fromDate);
    if (toDate)   filtered = filtered.filter(e => e.date <= toDate);

    const totalMiles = filtered.reduce((s, e) => s + e.miles, 0);
    const dayCount = filtered.length;
    const avgPerDay = dayCount > 0 ? totalMiles / dayCount : 0;

    const rollingAvg = (sorted, upToIdx, window = 5) => {
      const slice = sorted.slice(Math.max(0, upToIdx - window + 1), upToIdx + 1);
      return slice.reduce((s, e) => s + e.miles, 0) / slice.length;
    };

    const fmt = (dateStr) => new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let html = `<div class="mileage-filter-row">
      <label class="mileage-filter-label">From</label>
      <input type="date" id="mileageFrom" class="mileage-date-input" value="${fromDate}" />
      <label class="mileage-filter-label">To</label>
      <input type="date" id="mileageTo" class="mileage-date-input" value="${toDate}" />
      <button id="mileageApply" class="mileage-apply-btn">Apply</button>
    </div>`;

    if (filtered.length === 0 && todayMiles === null) {
      html += `<div class="mileage-empty">No mileage data yet. Enable GPS to start tracking.</div>`;
    } else {
      html += `<table class="mileage-table">
        <thead><tr><th>Date</th><th>Miles</th><th>Range</th><th>5-day avg</th><th></th></tr></thead>
        <tbody>`;

      // Today row (live)
      if (todayMiles !== null) {
        const rangeStr = (!isNaN(todayStart) && !isNaN(todayEnd))
          ? `${todayStart.toFixed(0)}→${todayEnd.toFixed(0)}` : '--';
        html += `<tr class="mileage-today-row">
          <td><span class="mileage-live-badge">Live</span> Today</td>
          <td>${todayMiles.toFixed(1)}</td>
          <td class="mileage-range">${rangeStr}</td>
          <td>--</td>
          <td></td>
        </tr>`;
      }

      // History rows — newest first
      [...filtered].reverse().forEach((entry) => {
        const origIdx = filtered.indexOf(entry);
        const avg = filtered.length >= 5 ? rollingAvg(filtered, origIdx) : null;
        html += `<tr>
          <td>${fmt(entry.date)}</td>
          <td>${entry.miles.toFixed(1)}</td>
          <td class="mileage-range">${entry.startMile.toFixed(0)}→${entry.endMile.toFixed(0)}</td>
          <td>${avg !== null ? avg.toFixed(1) : '--'}</td>
          <td><button class="mileage-delete-btn" data-date="${entry.date}" aria-label="Delete ${entry.date}">×</button></td>
        </tr>`;
      });

      html += `</tbody></table>`;
      if (dayCount > 0) {
        html += `<div class="mileage-summary-row">
          ${dayCount} day${dayCount !== 1 ? 's' : ''} &nbsp;·&nbsp; ${totalMiles.toFixed(1)} mi total &nbsp;·&nbsp; ${avgPerDay.toFixed(1)} mi/day avg
        </div>`;
      }
    }

    body.innerHTML = html;

    document.getElementById('mileageApply')?.addEventListener('click', () => {
      renderMileageLog(
        document.getElementById('mileageFrom').value,
        document.getElementById('mileageTo').value
      );
    });
    body.querySelectorAll('.mileage-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteMileageDay(btn.dataset.date);
        renderMileageLog(
          document.getElementById('mileageFrom')?.value || '',
          document.getElementById('mileageTo')?.value || ''
        );
      });
    });
  };

  const openMileageLog = () => {
    renderMileageLog();
    history.pushState({ panel: 'mileageLogModal' }, '');
    document.getElementById('mileageLogModal').classList.add('visible');
  };

  const dailyMilesBlock = document.getElementById('dailyMilesBlock');
  if (dailyMilesBlock) {
    dailyMilesBlock.addEventListener('click', openMileageLog);
    dailyMilesBlock.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMileageLog(); }
    });
  }

  const mileageLogModal = document.getElementById('mileageLogModal');
  document.getElementById('mileageLogClose')?.addEventListener('click', () => {
    mileageLogModal.classList.remove('visible');
  });
  mileageLogModal?.addEventListener('click', (e) => {
    if (e.target === mileageLogModal) mileageLogModal.classList.remove('visible');
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

  // Android back swipe / hardware back button — closes the topmost open panel
  const closeActivePanel = () => {
    // 1. Close topmost modal first (hourly, apiKeyInfo, waypoint, etc.)
    const modal = document.querySelector('.sources-modal.visible');
    if (modal) { modal.classList.remove('visible'); return; }
    // 2. Then fullscreen overlays (weather, elevation, waypoints)
    const overlay = document.querySelector('.fullscreen-overlay:not([hidden])');
    if (overlay) {
      overlay.hidden = true;
      restoreMapView();
      resetViewportScale();
      document.getElementById('moonPanel').hidden = true;
      return;
    }
    // 3. Then moon panel standalone
    const moonPanel = document.getElementById('moonPanel');
    if (moonPanel && !moonPanel.hidden) { moonPanel.hidden = true; return; }
  };
  window.addEventListener('popstate', (e) => {
    if (e.state?.panel) closeActivePanel();
  });
};

// ========== App Init ==========

const init = async () => {
  try {
    // Load saved toggle preferences
    loadToggleState();

    const dataset = await loadTrailDataset(state.trail);
    applyDataset(dataset);
    updateTrailChrome();

    console.log('Loaded', state.trail.shortName, state.allWaypoints.length, 'waypoints,', state.waterSources.length, 'water,', state.towns.length, 'towns,', state.categories.navigation.length, 'nav,', state.categories.toilets.length, 'toilets');
    window._odtState = state;

    // Stash real data so test mode can restore it
    realData = {
      allWaypoints: state.allWaypoints,
      waterSources: state.waterSources,
      towns: state.towns,
      categories: { ...state.categories },
      routeGeoJson: state.routeGeoJson,
      trail: state.trail
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
