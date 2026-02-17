import { sectionPoints, WATER_WARNING_MILES, MAP_INIT_DELAY_MS, CATEGORY_CONFIG } from './config.js';
import { state, loadElevationProfile, findNearestWaypoint, findMileFromCoords, findNextWater, findNextReliableWater, findNextOtherWater, findNextTown, getWaypointShortName, OFF_TRAIL_THRESHOLD } from './utils.js';
import { renderElevationChart } from './elevation.js';
import { showWaypointDetail, showWaterDetail, showTownDetail } from './modals.js';
import { setPositionUpdateCallback, shouldAllowMapClicks } from './gps.js';

let map = null;
let mapInitialized = false;
let userLocationMarker = null;
let userAccuracyCircle = null;

// Track pending async operations to prevent race conditions
let pendingMileUpdate = 0;

// Track off-trail status
let isOffTrail = false;

// Update map info panel with current mile data
// distanceFromTrail is optional - if provided, shows off-trail indicator when > threshold
export const showMapInfo = (mile, distanceFromTrail = 0) => {
  state.currentMile = mile;
  isOffTrail = distanceFromTrail > OFF_TRAIL_THRESHOLD;

  const mileEl = document.getElementById('mapCurrentMile');
  const labelEl = document.getElementById('mileLabel');

  if (isOffTrail) {
    mileEl.textContent = `${distanceFromTrail.toFixed(1)} mi`;
    mileEl.classList.add('off-trail');
    if (labelEl) { labelEl.textContent = 'Off Trail'; labelEl.classList.add('off-trail-label'); }
  } else {
    mileEl.textContent = mile.toFixed(1);
    mileEl.classList.remove('off-trail');
    if (labelEl) { labelEl.textContent = 'Mile'; labelEl.classList.remove('off-trail-label'); }
  }

  const nearest = findNearestWaypoint(mile);
  if (nearest) {
    const waypointName = nearest.waypoint.name || 'Unknown';
    const distance = nearest.distance;
    const direction = nearest.waypoint.mile < mile ? 'back' : 'ahead';

    if (distance < 0.05) {
      document.getElementById('mapNearestWaypoint').textContent = waypointName;
    } else {
      document.getElementById('mapNearestWaypoint').textContent = `${waypointName} · ${distance.toFixed(1)} mi ${direction}`;
    }
  }

  // Reliable water
  const nextReliable = findNextReliableWater(mile);
  const reliableEl = document.getElementById('mapNextReliableWater');
  if (reliableEl) {
    if (nextReliable) {
      const dist = nextReliable.mile - mile;
      const isWarning = dist >= WATER_WARNING_MILES;
      reliableEl.querySelector('span').textContent = `${dist.toFixed(1)}`;
      reliableEl.className = isWarning ? 'info-value warning' : 'info-value';
    } else {
      reliableEl.querySelector('span').textContent = '--';
      reliableEl.className = 'info-value';
    }
  }

  // Other water
  const nextOther = findNextOtherWater(mile);
  const otherEl = document.getElementById('mapNextOtherWater');
  if (otherEl) {
    if (nextOther) {
      const dist = nextOther.mile - mile;
      otherEl.querySelector('span').textContent = `${dist.toFixed(1)}`;
    } else {
      otherEl.querySelector('span').textContent = '--';
    }
  }

  const nextTown = findNextTown(mile);
  if (nextTown) {
    const dist = nextTown.mile - mile;
    document.getElementById('mapNextTown').querySelector('span').textContent = `${dist.toFixed(1)}`;
  } else {
    document.getElementById('mapNextTown').querySelector('span').textContent = '--';
  }

  renderElevationChart(mile, 'mapElevationChart');
};

// Initialize the map
export const initMap = () => {
  if (mapInitialized) return;
  mapInitialized = true;

  // Register PMTiles protocol
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  // Calculate bounds from route coordinates
  const routeCoords = sectionPoints.map(p => [p.lon, p.lat]);
  const bounds = routeCoords.reduce((acc, coord) => {
    return [
      [Math.min(acc[0][0], coord[0]), Math.min(acc[0][1], coord[1])],
      [Math.max(acc[1][0], coord[0]), Math.max(acc[1][1], coord[1])]
    ];
  }, [[routeCoords[0][0], routeCoords[0][1]], [routeCoords[0][0], routeCoords[0][1]]]);

  // Create map with vector basemap + overlay
  map = window._odtMap = new maplibregl.Map({
    container: 'mapContainer',
    style: {
      version: 8,
      glyphs: 'fonts/{fontstack}/{range}.pbf',
      sources: {
        'osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        },
        'basemap': {
          type: 'vector',
          url: 'pmtiles://basemap.pmtiles'
        },
        'overlay': {
          type: 'vector',
          url: 'pmtiles://overlay.pmtiles'
        },
        'contours': {
          type: 'vector',
          url: 'pmtiles://contours.pmtiles'
        }
      },
      layers: []
    },
    bounds: bounds,
    fitBoundsOptions: { padding: 40 },
    touchZoomRotate: true,
    touchPitch: false,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.on('load', async () => {
    // Helper function to load an image and add it to the map
    const loadIcon = (name, width, height, svgContent) => {
      return new Promise((resolve) => {
        const img = new Image(width, height);
        img.onload = () => {
          map.addImage(name, img);
          resolve();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(svgContent);
      });
    };

    // Load all custom marker icons before adding layers that use them
    await Promise.all([
      loadIcon('water-reliable-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
          <path d="M12 7c-1.5 2-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-1.5-3.5-3-5.5z" fill="#fff"/>
        </svg>
      `),
      loadIcon('water-other-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#94a3b8" stroke="#fff" stroke-width="2"/>
          <path d="M12 7c-1.5 2-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-1.5-3.5-3-5.5z" fill="#fff"/>
        </svg>
      `),
      loadIcon('town-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#059669" stroke="#fff" stroke-width="2"/>
          <path d="M8 16h8v-3h-2v-2h-1V9h-2v2H10v2H8v3zm3-7h2v1h-2V9z" fill="#fff"/>
        </svg>
      `),
      loadIcon('nav-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#8b5cf6" stroke="#fff" stroke-width="2"/>
          <path d="M12 6 L16 16 L12 14 L8 16 Z" fill="#fff"/>
        </svg>
      `),
      loadIcon('toilet-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#f59e0b" stroke="#fff" stroke-width="2"/>
          <rect x="9" y="10" width="6" height="7" rx="1" fill="#fff"/>
          <circle cx="12" cy="7.5" r="1.5" fill="#fff"/>
        </svg>
      `)
    ]);

    // Create category layers dynamically
    const createCategoryLayers = (category, data, config) => {
      if (!data || data.length === 0) return;

      const geojson = {
        type: 'FeatureCollection',
        features: data.map(item => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.lon, item.lat]
          },
          properties: {
            type: category,
            mile: item.mile,
            name: item.name,
            landmark: item.landmark || '',
            subcategory: item.subcategory || ''
          }
        }))
      };

      const visible = state.visibleCategories[category] ? 'visible' : 'none';

      map.addSource(`${category}-points`, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: config.clusterMaxZoom,
        clusterRadius: config.clusterRadius
      });

      map.addLayer({
        id: `${category}-clusters`,
        type: 'circle',
        source: `${category}-points`,
        filter: ['has', 'point_count'],
        layout: { visibility: visible },
        paint: {
          'circle-color': config.color,
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 25],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });

      map.addLayer({
        id: `${category}-cluster-count`,
        type: 'symbol',
        source: `${category}-points`,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          visibility: visible
        },
        paint: { 'text-color': '#fff' }
      });

      map.addLayer({
        id: `${category}-points-unclustered`,
        type: 'symbol',
        source: `${category}-points`,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': config.icon,
          'icon-size': 1,
          'icon-allow-overlap': false,
          visibility: visible
        },
        minzoom: config.minZoom
      });

      // Cluster click → zoom in
      map.on('click', `${category}-clusters`, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [`${category}-clusters`] });
        if (!features || features.length === 0) return;
        const clusterId = features[0].properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource(`${category}-points`);
        if (!source) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
        });
      });

      // Unclustered point clicks → show detail modal
      map.on('click', `${category}-points-unclustered`, (e) => {
        if (!e.features || e.features.length === 0) return;
        e.preventDefault();
        ++pendingMileUpdate;

        const itemName = e.features[0].properties?.name;

        if (category === 'water-reliable' || category === 'water-other') {
          const source = showWaterDetail(itemName);
          if (!shouldAllowMapClicks()) return;
          if (source && source.mile >= 0) showMapInfo(source.mile);
        } else if (category === 'towns') {
          const town = showTownDetail(itemName);
          if (!shouldAllowMapClicks()) return;
          if (town && town.mile >= 0) showMapInfo(town.mile, 0);
        } else {
          const waypoint = showWaypointDetail(itemName);
          if (!shouldAllowMapClicks()) return;
          if (waypoint && waypoint.mile >= 0) showMapInfo(waypoint.mile);
        }
      });

      // Cursor changes
      map.on('mouseenter', `${category}-clusters`, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', `${category}-clusters`, () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', `${category}-points-unclustered`, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', `${category}-points-unclustered`, () => map.getCanvas().style.cursor = '');
    };

    // Populate coordinates from elevation profile and create category layers
    const populateCoords = async () => {
      const profile = await loadElevationProfile();
      if (!profile) return;

      // Create layers for all categories
      for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
        createCategoryLayers(category, state.categories[category], config);
      }

      // Notify app that map sources are ready (used for deferred test-mode swap)
      if (_onMapReadyCallback) _onMapReadyCallback();
    };

    populateCoords();

    // Add basemap layers
    // OSM raster is the universal fallback — shows through wherever PMTiles has no data (e.g. DC in test mode)
    map.addLayer({ id: 'osm-raster', type: 'raster', source: 'osm-raster', paint: { 'raster-opacity': 1 } });
    map.addLayer({ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0', 'background-opacity': 0.92 } });

    map.addLayer({
      id: 'water',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'water',
      paint: { 'fill-color': '#aad3df', 'fill-opacity': 0.7 }
    });

    map.addLayer({
      id: 'landcover',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landcover',
      paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.3 }
    });

    map.addLayer({
      id: 'park',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'park',
      paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.4 }
    });

    map.addLayer({
      id: 'waterway',
      type: 'line',
      source: 'basemap',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#aad3df',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 2]
      }
    });

    map.addLayer({
      id: 'transportation',
      type: 'line',
      source: 'basemap',
      'source-layer': 'transportation',
      paint: {
        'line-color': [
          'match', ['get', 'class'],
          'motorway', '#fc8',
          'trunk', '#ffa',
          'primary', '#fdd',
          'secondary', '#fff',
          'track', '#d4b59e',
          '#ccc'
        ],
        'line-width': [
          'interpolate', ['exponential', 1.5], ['zoom'],
          5, 0.5,
          13, ['match', ['get', 'class'], ['motorway', 'trunk'], 3, ['primary'], 2, ['track'], 1.5, 1]
        ]
      }
    });

    map.addLayer({
      id: 'place',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'place',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 13, 16],
        'text-font': ['Noto Sans Regular']
      },
      paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 2 }
    });

    map.addLayer({
      id: 'mountain_peak',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'mountain_peak',
      minzoom: 11,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-font': ['Noto Sans Regular'],
        'icon-image': 'triangle-11',
        'icon-size': 0.8
      },
      paint: { 'text-color': '#666', 'text-halo-color': '#fff', 'text-halo-width': 1 }
    });

    map.addLayer({
      id: 'water_name',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'water_name',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-font': ['Noto Sans Regular']
      },
      paint: { 'text-color': '#5a80a0', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }
    });

    map.addLayer({
      id: 'transportation_name',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'transportation_name',
      minzoom: 10,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'symbol-placement': 'line',
        'text-font': ['Noto Sans Regular']
      },
      paint: { 'text-color': '#666', 'text-halo-color': '#fff', 'text-halo-width': 2 }
    });

    // Add contour lines from contours PMTiles
    // Minor contours (every 20 ft) — visible only at high zoom
    map.addLayer({
      id: 'contour-lines',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      paint: {
        'line-color': '#c8a87a',
        'line-width': 0.5,
        'line-opacity': 0.5
      }
    });

    // Index contours (every 100 ft) — thicker, visible at lower zoom
    // Convert meters to feet and round to avoid floating-point modulo issues
    const indexFilter = ['==', ['%', ['round', ['*', ['get', 'ELEVATION'], 3.28084]], 100], 0];
    map.addLayer({
      id: 'contour-lines-index',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 9,
      filter: indexFilter,
      paint: {
        'line-color': '#b0926a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 1.5],
        'line-opacity': 0.7
      }
    });

    // Elevation labels on index contours
    map.addLayer({
      id: 'contour-labels',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 11,
      filter: indexFilter,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['concat', ['to-string', ['round', ['*', ['get', 'ELEVATION'], 3.28084]]], '′'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 11],
        'text-font': ['Noto Sans Regular'],
        'text-max-angle': 25
      },
      paint: {
        'text-color': '#9a7d5a',
        'text-halo-color': '#fff',
        'text-halo-width': 1
      }
    });

    // Add route line layer from overlay
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'overlay',
      'source-layer': 'route',
      paint: { 'line-color': '#e11d48', 'line-width': 3, 'line-opacity': 0.9 }
    });

    // Add section markers from overlay
    map.addLayer({
      id: 'section-circles',
      type: 'circle',
      source: 'overlay',
      'source-layer': 'sections',
      paint: {
        'circle-radius': 8,
        'circle-color': '#1b1b1b',
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2
      }
    });

    map.addLayer({
      id: 'section-numbers',
      type: 'symbol',
      source: 'overlay',
      'source-layer': 'sections',
      layout: {
        'text-field': ['slice', ['get', 'name'], 0, ['index-of', ':', ['get', 'name']]],
        'text-size': 10,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true
      },
      paint: { 'text-color': '#fff' }
    });

    map.addLayer({
      id: 'section-labels',
      type: 'symbol',
      source: 'overlay',
      'source-layer': 'sections',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-max-width': 12
      },
      paint: { 'text-color': '#1b1b1b', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      minzoom: 9
    });

    // Click handlers for overlay layers (inside map.on('load') to ensure layers exist)
    // Use pendingMileUpdate to prevent race conditions from rapid clicks
    // These only update mile info when GPS mode is off (except waypoint modal still opens)
    // Section circles are ON the trail by definition — always pass distanceFromTrail: 0
    map.on('click', 'section-circles', async (e) => {
      if (!e.features || e.features.length === 0) return;
      if (!shouldAllowMapClicks()) return; // GPS mode active, ignore clicks
      e.preventDefault();
      const updateId = ++pendingMileUpdate;
      const coords = e.features[0].geometry.coordinates;
      const result = await findMileFromCoords(coords[1], coords[0]);
      if (updateId === pendingMileUpdate) {
        showMapInfo(result.mile, 0);
      }
    });

    // Route-line clicks are ON the trail by definition — always pass distanceFromTrail: 0
    map.on('click', 'route-line', async (e) => {
      // Check if a category point was clicked at this location - if so, skip route-line handling
      const categoryLayers = Object.keys(CATEGORY_CONFIG)
        .map(cat => `${cat}-points-unclustered`)
        .filter(id => map.getLayer(id));
      const pointFeatures = map.queryRenderedFeatures(e.point, { layers: categoryLayers });
      if (pointFeatures.length > 0) return;
      if (!shouldAllowMapClicks()) return; // GPS mode active, ignore clicks
      e.preventDefault();
      const updateId = ++pendingMileUpdate;
      const coords = e.lngLat;
      const result = await findMileFromCoords(coords.lat, coords.lng);
      if (updateId === pendingMileUpdate) {
        showMapInfo(result.mile, 0);
      }
    });

    // Cursor changes for overlay layers
    map.on('mouseenter', 'section-circles', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'section-circles', () => map.getCanvas().style.cursor = '');
    map.on('mouseenter', 'route-line', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'route-line', () => map.getCanvas().style.cursor = '');

    // Category toggles are now managed by app.js settings popover
  });

  // NavigationControl (+/-) removed — zoom handled by pinch/scroll

  // Add scale control - position it bottom-left above elevation chart (avoid overlap with info panel in top-left)
  map.addControl(new maplibregl.ScaleControl({
    maxWidth: 150,
    unit: 'imperial'
  }), 'bottom-left');

  // Add custom zoom level display as a proper MapLibre control
  const zoomControl = {
    onAdd(mapInstance) {
      this._map = mapInstance;
      this._container = document.createElement('div');
      this._container.className = 'maplibregl-ctrl zoom-level-display';
      this._container.textContent = `z${Math.round(mapInstance.getZoom())}`;
      mapInstance.on('zoom', () => {
        this._container.textContent = `z${Math.round(mapInstance.getZoom())}`;
      });
      return this._container;
    },
    onRemove() {
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }
  };
  map.addControl(zoomControl, 'bottom-left');

  // Register GPS position update callback for map marker
  setPositionUpdateCallback(updateUserLocationMarker);
};

// Update user location marker on the map
const updateUserLocationMarker = (lat, lon, accuracy) => {
  if (!map) return;

  // If lat/lon is null, remove the marker
  if (lat === null || lon === null) {
    if (userLocationMarker) {
      userLocationMarker.remove();
      userLocationMarker = null;
    }
    if (userAccuracyCircle) {
      if (map.getLayer('user-accuracy-circle')) {
        map.removeLayer('user-accuracy-circle');
      }
      if (map.getSource('user-accuracy')) {
        map.removeSource('user-accuracy');
      }
      userAccuracyCircle = null;
    }
    return;
  }

  const lngLat = [lon, lat];

  // Create or update the accuracy circle
  const radiusInMeters = accuracy || 10;
  const accuracyCircleData = createCircleGeoJSON(lat, lon, radiusInMeters);

  if (!userAccuracyCircle) {
    // Add accuracy circle source and layer
    map.addSource('user-accuracy', {
      type: 'geojson',
      data: accuracyCircleData
    });

    map.addLayer({
      id: 'user-accuracy-circle',
      type: 'fill',
      source: 'user-accuracy',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.15
      }
    }, 'route-line'); // Insert below route line

    userAccuracyCircle = true;
  } else {
    // Update existing source
    const source = map.getSource('user-accuracy');
    if (source) {
      source.setData(accuracyCircleData);
    }
  }

  // Create or update the location marker
  if (!userLocationMarker) {
    const el = document.createElement('div');
    el.className = 'user-location-marker pulsing';

    userLocationMarker = new maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(map);

    // Pan to user location on first fix
    map.flyTo({
      center: lngLat,
      zoom: Math.max(map.getZoom(), 12),
      duration: 1000
    });

    // Update GPS status
    const statusEl = document.getElementById('gpsStatus');
    if (statusEl) {
      statusEl.textContent = 'Active';
      statusEl.className = 'gps-status active';
    }
  } else {
    userLocationMarker.setLngLat(lngLat);
  }
};

// Create a circle GeoJSON polygon for accuracy visualization
const createCircleGeoJSON = (lat, lon, radiusMeters) => {
  const points = 64;
  const coords = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    // Approximate degrees per meter at this latitude
    const latOffset = (radiusMeters / 111320) * Math.cos(angle);
    const lonOffset = (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
    coords.push([lon + lonOffset, lat + latOffset]);
  }
  coords.push(coords[0]); // Close the polygon

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
};

// Callback invoked once map sources are created (after populateCoords completes).
// Used by app.js to defer test-mode data swap until sources exist.
let _onMapReadyCallback = null;
export const onMapReady = (cb) => { _onMapReadyCallback = cb; };

// Swap GeoJSON data for a category's map source (adapter pattern for test mode).
// No-ops silently if the source doesn't exist.
export const swapCategoryData = (category, data) => {
  if (!map) return;
  const source = map.getSource(`${category}-points`);
  if (!source) return;
  source.setData({
    type: 'FeatureCollection',
    features: (data || []).map(item => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
      properties: {
        type: category,
        mile: item.mile,
        name: item.name,
        landmark: item.landmark || '',
        subcategory: item.subcategory || ''
      }
    }))
  });
};

// Toggle map layer visibility for a category
export const toggleCategoryLayer = (category, visible) => {
  if (!map) return;
  const visibility = visible ? 'visible' : 'none';
  const layerIds = [
    `${category}-clusters`,
    `${category}-cluster-count`,
    `${category}-points-unclustered`
  ];
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibility);
    }
  }
};


// Schedule map initialization
export const scheduleMapInit = () => {
  setTimeout(initMap, MAP_INIT_DELAY_MS);
};
