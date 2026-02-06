import { sectionPoints, WATER_WARNING_MILES, MAP_INIT_DELAY_MS } from './config.js';
import { state, loadElevationProfile, findNearestWaypoint, findMileFromCoords, findNextWater, findNextTown, getWaypointShortName, OFF_TRAIL_THRESHOLD } from './utils.js';
import { renderElevationChart } from './elevation.js';
import { showWaypointDetail, showWaterDetail } from './modals.js';
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
  const labelEl = document.querySelector('.map-info-current-label');

  if (isOffTrail) {
    mileEl.textContent = `${distanceFromTrail.toFixed(1)} mi`;
    mileEl.classList.add('off-trail');
    labelEl.textContent = 'Off Trail';
  } else {
    mileEl.textContent = mile.toFixed(1);
    mileEl.classList.remove('off-trail');
    labelEl.textContent = 'Current Mile';
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

  const nextWater = findNextWater(mile);
  if (nextWater) {
    const dist = nextWater.mile - mile;
    const isWarning = dist >= WATER_WARNING_MILES;
    document.getElementById('mapNextWater').querySelector('span').textContent = `${dist.toFixed(1)}`;
    document.getElementById('mapNextWater').className = isWarning ? 'map-info-value warning' : 'map-info-value';
  } else {
    document.getElementById('mapNextWater').querySelector('span').textContent = '--';
    document.getElementById('mapNextWater').className = 'map-info-value';
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
      glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
      sources: {
        'basemap': {
          type: 'vector',
          url: 'pmtiles://basemap.pmtiles'
        },
        'overlay': {
          type: 'vector',
          url: 'pmtiles://overlay.pmtiles'
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
      loadIcon('water-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
          <path d="M12 7c-1.5 2-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-1.5-3.5-3-5.5z" fill="#fff"/>
        </svg>
      `),
      loadIcon('town-icon', 24, 24, `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="11" fill="#059669" stroke="#fff" stroke-width="2"/>
          <path d="M8 16h8v-3h-2v-2h-1V9h-2v2H10v2H8v3zm3-7h2v1h-2V9z" fill="#fff"/>
        </svg>
      `),
      loadIcon('waypoint-icon', 20, 20, `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9" fill="#8b5cf6" stroke="#fff" stroke-width="2"/>
        </svg>
      `)
    ]);

    // Create GeoJSON sources for water and towns with clustering
    const waterGeoJSON = {
      type: 'FeatureCollection',
      features: state.waterSources.map(source => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [source.lon, source.lat]
        },
        properties: {
          type: 'water',
          mile: source.mile,
          name: source.name, // Use original name (e.g. CV001) for lookup
          displayName: getWaypointShortName(source),
          details: source.details
        }
      }))
    };

    const townGeoJSON = {
      type: 'FeatureCollection',
      features: state.towns.map(town => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [town.lon, town.lat]
        },
        properties: {
          type: 'town',
          mile: town.mile,
          name: town.name,
          services: town.services
        }
      }))
    };

    // Populate coordinates from elevation profile
    const populateCoords = async () => {
      const profile = await loadElevationProfile();
      if (!profile) return;

      // Add clustered sources
      map.addSource('water-points', {
        type: 'geojson',
        data: waterGeoJSON,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 35
      });

      map.addSource('town-points', {
        type: 'geojson',
        data: townGeoJSON,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40
      });

      // Add cluster layers
      map.addLayer({
        id: 'water-clusters',
        type: 'circle',
        source: 'water-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3b82f6',
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 25],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });

      map.addLayer({
        id: 'water-cluster-count',
        type: 'symbol',
        source: 'water-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Regular'],
          'text-size': 12
        },
        paint: { 'text-color': '#fff' }
      });

      map.addLayer({
        id: 'town-clusters',
        type: 'circle',
        source: 'town-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#059669',
          'circle-radius': ['step', ['get', 'point_count'], 18, 3, 22, 5, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });

      map.addLayer({
        id: 'town-cluster-count',
        type: 'symbol',
        source: 'town-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Regular'],
          'text-size': 12
        },
        paint: { 'text-color': '#fff' }
      });

      // Add unclustered point layers
      map.addLayer({
        id: 'water-points-unclustered',
        type: 'symbol',
        source: 'water-points',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'water-icon',
          'icon-size': 1,
          'icon-allow-overlap': false
        },
        minzoom: 8
      });

      map.addLayer({
        id: 'town-points-unclustered',
        type: 'symbol',
        source: 'town-points',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'town-icon',
          'icon-size': 1,
          'icon-allow-overlap': false
        },
        minzoom: 7
      });

      // Cluster click handlers
      map.on('click', 'water-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['water-clusters'] });
        if (!features || features.length === 0) return;
        const clusterId = features[0].properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource('water-points');
        if (!source) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
        });
      });

      map.on('click', 'town-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['town-clusters'] });
        if (!features || features.length === 0) return;
        const clusterId = features[0].properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource('town-points');
        if (!source) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
        });
      });

      // Unclustered point click handlers
      // Water points show detail modal
      map.on('click', 'water-points-unclustered', (e) => {
        if (!e.features || e.features.length === 0) return;
        e.preventDefault();
        ++pendingMileUpdate;

        // Get water source name and show detail modal
        const sourceName = e.features[0].properties?.name;
        const source = showWaterDetail(sourceName);

        // Update mile info if GPS mode is off
        if (!shouldAllowMapClicks()) return;
        if (source && source.mile >= 0) {
          showMapInfo(source.mile);
        }
      });

      // Town points just update mile info (could add town detail modal later)
      map.on('click', 'town-points-unclustered', async (e) => {
        if (!e.features || e.features.length === 0) return;
        if (!shouldAllowMapClicks()) return; // GPS mode active, ignore clicks
        e.preventDefault();
        const updateId = ++pendingMileUpdate;
        const coords = e.features[0].geometry.coordinates;
        const result = await findMileFromCoords(coords[1], coords[0]);
        if (updateId === pendingMileUpdate) {
          showMapInfo(result.mile, result.distanceFromTrail);
        }
      });

      // Cursor changes
      map.on('mouseenter', 'water-clusters', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'water-clusters', () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', 'town-clusters', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'town-clusters', () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', 'water-points-unclustered', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'water-points-unclustered', () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', 'town-points-unclustered', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'town-points-unclustered', () => map.getCanvas().style.cursor = '');
    };

    populateCoords();

    // Add basemap layers
    map.addLayer({ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } });

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

    map.addLayer({
      id: 'waypoint-icons',
      type: 'symbol',
      source: 'overlay',
      'source-layer': 'waypoints',
      layout: {
        'icon-image': 'waypoint-icon',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 0.8],
        'icon-allow-overlap': ['step', ['zoom'], false, 12, true],
        'icon-ignore-placement': ['step', ['zoom'], false, 12, true]
      },
      minzoom: 8
    });

    // Click handlers for overlay layers (inside map.on('load') to ensure layers exist)
    // Use pendingMileUpdate to prevent race conditions from rapid clicks
    // These only update mile info when GPS mode is off (except waypoint modal still opens)
    map.on('click', 'section-circles', async (e) => {
      if (!e.features || e.features.length === 0) return;
      if (!shouldAllowMapClicks()) return; // GPS mode active, ignore clicks
      e.preventDefault();
      const updateId = ++pendingMileUpdate;
      const coords = e.features[0].geometry.coordinates;
      const result = await findMileFromCoords(coords[1], coords[0]);
      if (updateId === pendingMileUpdate) {
        showMapInfo(result.mile, result.distanceFromTrail);
      }
    });

    map.on('click', 'waypoint-icons', async (e) => {
      if (!e.features || e.features.length === 0) return;
      e.preventDefault();
      ++pendingMileUpdate; // Increment to cancel any pending route-line updates

      // Get waypoint name from PMTiles feature and look up by name
      const waypointName = e.features[0].properties?.name;
      // Always show waypoint detail modal, even in GPS mode
      const waypoint = showWaypointDetail(waypointName);

      // Only update info panel if GPS mode is off
      if (!shouldAllowMapClicks()) return;
      if (waypoint && waypoint.mile >= 0) {
        showMapInfo(waypoint.mile);
      }
    });

    map.on('click', 'route-line', async (e) => {
      // Check if a waypoint icon was clicked at this location - if so, skip route-line handling
      const waypointFeatures = map.queryRenderedFeatures(e.point, { layers: ['waypoint-icons'] });
      if (waypointFeatures.length > 0) {
        return; // Let waypoint-icons handler deal with it
      }
      if (!shouldAllowMapClicks()) return; // GPS mode active, ignore clicks
      e.preventDefault();
      const updateId = ++pendingMileUpdate;
      const coords = e.lngLat;
      const result = await findMileFromCoords(coords.lat, coords.lng);
      if (updateId === pendingMileUpdate) {
        showMapInfo(result.mile, result.distanceFromTrail);
      }
    });

    // Cursor changes for overlay layers
    map.on('mouseenter', 'section-circles', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'section-circles', () => map.getCanvas().style.cursor = '');
    map.on('mouseenter', 'waypoint-icons', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'waypoint-icons', () => map.getCanvas().style.cursor = '');
    map.on('mouseenter', 'route-line', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'route-line', () => map.getCanvas().style.cursor = '');
  });

  // Add navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // Add scale control - position it top-left to avoid elevation chart
  map.addControl(new maplibregl.ScaleControl({
    maxWidth: 150,
    unit: 'imperial'
  }), 'top-left');

  // Add custom zoom level display in bottom-left (above elevation chart)
  const zoomDisplay = document.createElement('div');
  zoomDisplay.className = 'zoom-level-display';
  zoomDisplay.textContent = `z${Math.round(map.getZoom())}`;
  const bottomLeftCtrl = document.querySelector('.maplibregl-ctrl-bottom-left');
  if (bottomLeftCtrl) { // [BUGS] Fixed: null check before appendChild - element may not exist yet
    bottomLeftCtrl.appendChild(zoomDisplay);
  }

  // Update zoom display on zoom change
  map.on('zoom', () => {
    zoomDisplay.textContent = `z${Math.round(map.getZoom())}`;
  });

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

// Schedule map initialization
export const scheduleMapInit = () => {
  setTimeout(initMap, MAP_INIT_DELAY_MS);
};
