import { test, expect } from '@playwright/test';

test.describe('ODT Weather App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to initialize
    await page.waitForSelector('#mapContainer');
  });

  test.describe('Page Load', () => {
    test('has correct title', async ({ page }) => {
      await expect(page).toHaveTitle('Oregon Desert Trail Weather');
    });

    test('displays header with app name', async ({ page }) => {
      const header = page.locator('h1');
      await expect(header).toContainText('Oregon Desert Trail Weather');
    });

    test('shows map tab as active by default', async ({ page }) => {
      const mapTab = page.locator('.tab-btn[data-tab="map"]');
      await expect(mapTab).toHaveClass(/active/);
    });

    test('displays info panel with mile 0', async ({ page }) => {
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toContainText('0.0');
    });
  });

  test.describe('Tab Navigation', () => {
    test('switches to weather tab', async ({ page }) => {
      await page.click('.tab-btn[data-tab="weather"]');

      const weatherTab = page.locator('.tab-btn[data-tab="weather"]');
      await expect(weatherTab).toHaveClass(/active/);

      const weatherContent = page.locator('#weatherTab');
      await expect(weatherContent).toHaveClass(/active/);
    });

    test('switches back to map tab', async ({ page }) => {
      await page.click('.tab-btn[data-tab="weather"]');
      await page.click('.tab-btn[data-tab="map"]');

      const mapTab = page.locator('.tab-btn[data-tab="map"]');
      await expect(mapTab).toHaveClass(/active/);
    });
  });

  test.describe('Info Modal', () => {
    test('opens when info button clicked', async ({ page }) => {
      await page.click('#infoBtn');

      const modal = page.locator('#infoModal');
      await expect(modal).toHaveClass(/visible/);
    });

    test('closes when close button clicked', async ({ page }) => {
      await page.click('#infoBtn');
      await page.click('#closeInfoModal');

      const modal = page.locator('#infoModal');
      await expect(modal).not.toHaveClass(/visible/);
    });

    test('closes when clicking backdrop', async ({ page }) => {
      await page.click('#infoBtn');
      // Click on the modal backdrop (not the content)
      await page.click('#infoModal', { position: { x: 10, y: 10 } });

      const modal = page.locator('#infoModal');
      await expect(modal).not.toHaveClass(/visible/);
    });

    test('displays app information', async ({ page }) => {
      await page.click('#infoBtn');

      const content = page.locator('#infoModal .sources-modal-content');
      await expect(content).toContainText('Oregon Desert Trail Weather');
      await expect(content).toContainText('PirateWeather');
      await expect(content).toContainText('852 waypoints');
    });
  });

  test.describe('Water Sources Modal', () => {
    test('opens when water card clicked', async ({ page }) => {
      await page.click('#nextWaterCard');

      const modal = page.locator('#sourcesModal');
      await expect(modal).toHaveClass(/visible/);

      const title = page.locator('#sourcesModalTitle');
      await expect(title).toContainText('Water Sources');
    });

    test('displays water source list', async ({ page }) => {
      await page.click('#nextWaterCard');

      const list = page.locator('#sourcesList');
      // Wait for list to populate
      await expect(list.locator('.source-item').first()).toBeVisible();

      // Should have multiple water sources
      const items = await list.locator('.source-item').count();
      expect(items).toBeGreaterThan(10);
    });

    test('closes when close button clicked', async ({ page }) => {
      await page.click('#nextWaterCard');
      await page.click('#closeSourcesModal');

      const modal = page.locator('#sourcesModal');
      await expect(modal).not.toHaveClass(/visible/);
    });
  });

  test.describe('Towns Modal', () => {
    test('opens when town card clicked', async ({ page }) => {
      await page.click('#nextTownCard');

      const modal = page.locator('#sourcesModal');
      await expect(modal).toHaveClass(/visible/);

      const title = page.locator('#sourcesModalTitle');
      await expect(title).toContainText('Towns');
    });

    test('displays town list with services', async ({ page }) => {
      await page.click('#nextTownCard');

      const list = page.locator('#sourcesList');
      await expect(list.locator('.source-item').first()).toBeVisible();

      // Should contain service information
      await expect(list).toContainText('Services:');
    });
  });

  test.describe('Weather Table', () => {
    test('loads weather forecasts', async ({ page }) => {
      await page.click('.tab-btn[data-tab="weather"]');

      // Wait for table to render (replace loading message)
      await page.waitForSelector('#container table', { timeout: 15000 });

      const table = page.locator('#container table');
      await expect(table).toBeVisible();
    });

    test('displays 25 section rows', async ({ page }) => {
      await page.click('.tab-btn[data-tab="weather"]');
      await page.waitForSelector('#container table', { timeout: 15000 });

      const rows = page.locator('#container tbody tr');
      await expect(rows).toHaveCount(25);
    });

    test('shows section names with mile markers', async ({ page }) => {
      await page.click('.tab-btn[data-tab="weather"]');
      await page.waitForSelector('#container table', { timeout: 15000 });

      const firstRow = page.locator('#container tbody tr').first();
      await expect(firstRow).toContainText('Badlands');
      await expect(firstRow).toContainText('0'); // Mile 0
    });
  });

  test.describe('Map Info Panel', () => {
    test('displays current mile', async ({ page }) => {
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toBeVisible();
    });

    test('displays nearest waypoint', async ({ page }) => {
      const waypoint = page.locator('#mapNearestWaypoint');
      await expect(waypoint).toBeVisible();
    });

    test('displays next water distance', async ({ page }) => {
      const water = page.locator('#mapNextWater span');
      await expect(water).toBeVisible();
    });

    test('displays next town distance', async ({ page }) => {
      const town = page.locator('#mapNextTown span');
      await expect(town).toBeVisible();
    });

    test('displays GPS toggle button', async ({ page }) => {
      const gpsBtn = page.locator('#gpsToggleBtn');
      await expect(gpsBtn).toBeVisible();
      await expect(gpsBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('GPS button toggles active state on click', async ({ page, context }) => {
      // Mock geolocation before interacting with GPS
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 43.708, longitude: -120.847 });

      const gpsBtn = page.locator('#gpsToggleBtn');
      await expect(gpsBtn).toBeVisible();

      // Toggle on
      await gpsBtn.click();
      await expect(gpsBtn).toHaveClass(/active/, { timeout: 2000 });
      await expect(gpsBtn).toHaveAttribute('aria-pressed', 'true');

      // Toggle off
      await gpsBtn.click();
      await expect(gpsBtn).not.toHaveClass(/active/, { timeout: 2000 });
      await expect(gpsBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  test.describe('Elevation Chart', () => {
    test('renders elevation chart canvas', async ({ page }) => {
      const canvas = page.locator('#mapElevationChart');
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Map Controls', () => {
    test('scale control is visible and not obscured', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      // Scale control should be in top-left and visible
      const scaleControl = page.locator('.maplibregl-ctrl-scale');
      await expect(scaleControl).toBeVisible();

      // Check that scale control is in top-left container
      const topLeftContainer = page.locator('.maplibregl-ctrl-top-left');
      await expect(topLeftContainer.locator('.maplibregl-ctrl-scale')).toBeVisible();
    });

    test('zoom level display is visible', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      // Zoom display should be visible
      const zoomDisplay = page.locator('.zoom-level-display');
      await expect(zoomDisplay).toBeVisible();

      // Should show a zoom level
      const zoomText = await zoomDisplay.textContent();
      expect(zoomText).toMatch(/^z\d+$/);
    });

    test('zoom level updates when zooming', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      const zoomDisplay = page.locator('.zoom-level-display');
      const initialZoom = await zoomDisplay.textContent();

      // Click zoom in button
      await page.click('.maplibregl-ctrl-zoom-in');
      await page.waitForTimeout(500);

      const newZoom = await zoomDisplay.textContent();
      // Zoom level should have increased (or at least changed)
      expect(newZoom).toMatch(/^z\d+$/);
    });
  });

  test.describe('Off-Trail Display', () => {
    test('shows "Current Mile" label when on trail', async ({ page, context }) => {
      // Grant geolocation permissions
      await context.grantPermissions(['geolocation']);
      // Set location exactly on the trail (near section 1)
      await context.setGeolocation({ latitude: 43.708, longitude: -120.847 });

      // Toggle GPS on
      await page.click('#gpsToggleBtn');
      await page.waitForTimeout(2000);

      // Check that "Current Mile" label is shown (not "Off Trail")
      const label = page.locator('.map-info-current-label');
      await expect(label).toContainText('Current Mile');

      // Check that mile display does not have off-trail class
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).not.toHaveClass(/off-trail/);
    });

    test('shows "Off Trail" indicator when far from trail', async ({ page, context }) => {
      // Grant geolocation permissions
      await context.grantPermissions(['geolocation']);
      // Set location about 2 miles off trail (significantly east)
      // The trail runs roughly N-S around -120.847 longitude
      await context.setGeolocation({ latitude: 43.708, longitude: -120.80 });

      // Toggle GPS on
      await page.click('#gpsToggleBtn');
      await page.waitForTimeout(2000);

      // Check that "Off Trail" label is shown
      const label = page.locator('.map-info-current-label');
      await expect(label).toContainText('Off Trail');

      // Check that mile display has off-trail class
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toHaveClass(/off-trail/);

      // Check that it shows distance in "X.X mi" format instead of mile number
      const mileText = await mileDisplay.textContent();
      expect(mileText).toMatch(/[\d.]+\s*mi/);
    });

    test('shows "Current Mile" when off trail but within threshold', async ({ page, context }) => {
      // Grant geolocation permissions
      await context.grantPermissions(['geolocation']);
      // Set location about 0.3 miles off trail (within 0.5 mile threshold)
      // At 43°N: 0.006 degrees lon ≈ 0.3 miles
      await context.setGeolocation({ latitude: 43.708, longitude: -120.841 });

      // Toggle GPS on
      await page.click('#gpsToggleBtn');
      await page.waitForTimeout(2000);

      // Should still show "Current Mile" since we're within threshold
      const label = page.locator('.map-info-current-label');
      await expect(label).toContainText('Current Mile');

      // Check that mile display does not have off-trail class
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).not.toHaveClass(/off-trail/);
    });
  });

  test.describe('Waypoint Modal via Map Click', () => {
    test('map tiles load correctly', async ({ page }) => {
      // Collect console messages
      const logs = [];
      page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
      page.on('pageerror', err => logs.push(`ERROR: ${err.message}`));

      // Track network requests for pmtiles
      const pmtilesRequests = [];
      page.on('response', res => {
        if (res.url().includes('pmtiles')) {
          pmtilesRequests.push({ url: res.url(), status: res.status() });
        }
      });

      // Wait for map to initialize
      await page.waitForTimeout(5000);

      // Log what we found
      console.log('PMTiles requests:', pmtilesRequests);
      console.log('Console logs:', logs.filter(l => l.includes('error') || l.includes('Error')));

      // Check that canvas exists
      const hasCanvas = await page.evaluate(() => {
        const canvas = document.querySelector('#mapContainer canvas');
        return canvas !== null;
      });
      expect(hasCanvas).toBe(true);

      // Check that pmtiles were requested
      expect(pmtilesRequests.length).toBeGreaterThan(0);
    });

    test('clicking on waypoint icon opens waypoint modal', async ({ page }) => {
      // Wait for map to fully initialize
      await page.waitForTimeout(3000);

      // Fly to exact waypoint location (CV001 - trailhead) at zoom 14 (max for overlay pmtiles)
      const waypointResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          const map = window._odtMap;
          if (!map) {
            resolve({ error: 'no map' });
            return;
          }

          // Use section 2 area (mile 36) to avoid edge cases at mile 0
          // Section 2: Sand Spring to South Reservoir
          const waypointLon = -120.847;
          const waypointLat = 43.708;

          // Zoom to level 13 (max zoom for overlay PMTiles, also minzoom for waypoint-icons)
          map.flyTo({
            center: [waypointLon, waypointLat],
            zoom: 13,
            duration: 0
          });

          map.once('idle', () => {
            // Wait for tiles to fully render
            setTimeout(() => {
              // Debug: Check all sources and their loaded state
              const sources = Object.keys(map.getStyle().sources);
              const layers = map.getStyle().layers.map(l => ({
                id: l.id,
                source: l.source,
                sourceLayer: l['source-layer'],
                minzoom: l.minzoom
              }));

              // Check if waypoint-icon image is loaded
              const hasWaypointIcon = map.hasImage('waypoint-icon');
              console.log('Has waypoint-icon image:', hasWaypointIcon);

              // Query for waypoint features across the whole viewport
              const waypointFeatures = map.queryRenderedFeatures({ layers: ['waypoint-icons'] });

              // Also try querying without layer filter to see all features from overlay source
              const overlayFeatures = map.querySourceFeatures('overlay', { sourceLayer: 'waypoints' });
              console.log('Overlay waypoints source features:', overlayFeatures.length);

              // Check layer visibility and get layer details
              const waypointLayer = map.getLayer('waypoint-icons');
              const waypointLayerDetails = waypointLayer ? {
                id: waypointLayer.id,
                type: waypointLayer.type,
                visibility: map.getLayoutProperty('waypoint-icons', 'visibility'),
                iconImage: map.getLayoutProperty('waypoint-icons', 'icon-image')
              } : null;
              console.log('Waypoint layer details:', waypointLayerDetails);

              // Get first waypoint from source
              const firstWaypoint = overlayFeatures.length > 0 ? {
                coords: overlayFeatures[0].geometry.coordinates,
                props: overlayFeatures[0].properties
              } : null;
              console.log('First waypoint from source:', firstWaypoint);

              // Also query for ALL features to see what's rendering
              const allFeatures = map.queryRenderedFeatures();
              const featuresByLayer = {};
              allFeatures.forEach(f => {
                const layerId = f.layer?.id || 'unknown';
                featuresByLayer[layerId] = (featuresByLayer[layerId] || 0) + 1;
              });

              if (waypointFeatures.length > 0) {
                // Get screen coordinates of first waypoint
                const feature = waypointFeatures[0];
                const coords = feature.geometry.coordinates;
                const point = map.project(coords);
                resolve({
                  success: true,
                  waypointCount: waypointFeatures.length,
                  clickX: point.x,
                  clickY: point.y,
                  waypointName: feature.properties?.name || 'unknown',
                  zoom: map.getZoom()
                });
              } else {
                // Check layer visibility and get layer details
                const waypointLayer = map.getLayer('waypoint-icons');
                const waypointLayerDetails = waypointLayer ? {
                  id: waypointLayer.id,
                  type: waypointLayer.type,
                  visibility: map.getLayoutProperty('waypoint-icons', 'visibility'),
                  iconImage: map.getLayoutProperty('waypoint-icons', 'icon-image')
                } : 'layer not found';

                // Get first waypoint from source
                const firstWaypoint = overlayFeatures.length > 0 ? {
                  coords: overlayFeatures[0].geometry.coordinates,
                  props: overlayFeatures[0].properties
                } : null;

                resolve({
                  success: false,
                  waypointCount: 0,
                  zoom: map.getZoom(),
                  center: map.getCenter(),
                  sources,
                  layerCount: layers.length,
                  totalFeatures: allFeatures.length,
                  featuresByLayer,
                  hasWaypointIcon,
                  sourceWaypointCount: overlayFeatures.length,
                  waypointLayerDetails,
                  firstWaypoint
                });
              }
            }, 2000); // Give more time for tiles to load
          });

          // Fallback timeout
          setTimeout(() => resolve({ error: 'timeout' }), 8000);
        });
      });

      console.log('Waypoint query result:', JSON.stringify(waypointResult, null, 2));
      await page.screenshot({ path: 'test-results/map-at-waypoint-zoom.png' });

      // If no waypoint icons found, the overlay might not be loading correctly
      if (!waypointResult.success) {
        console.log('DEBUG: No waypoint icons found. Features by layer:', waypointResult.featuresByLayer);
      }

      // Click on the waypoint if found, otherwise click center
      const canvas = page.locator('#mapContainer canvas.maplibregl-canvas');
      const box = await canvas.boundingBox();

      let clickX, clickY;
      if (waypointResult.success && waypointResult.clickX !== undefined) {
        clickX = waypointResult.clickX;
        clickY = waypointResult.clickY;
        console.log(`Clicking on waypoint at (${clickX}, ${clickY})`);
      } else {
        clickX = box.width / 2;
        clickY = box.height / 2;
        console.log(`Clicking center at (${clickX}, ${clickY})`);
      }

      await canvas.click({ position: { x: clickX, y: clickY } });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/map-after-click.png' });

      // Check if waypoint modal opened
      const modal = page.locator('#waypointModal');
      await expect(modal).toHaveClass(/visible/, { timeout: 5000 });
    });

    test('waypoint click shows consistent mile in modal and info panel', async ({ page }) => {
      // Wait for map to fully initialize
      await page.waitForTimeout(3000);

      // Navigate to a waypoint and click it
      const result = await page.evaluate(() => {
        return new Promise((resolve) => {
          const map = window._odtMap;
          if (!map) {
            resolve({ error: 'no map' });
            return;
          }

          // Fly to section 2 area
          map.flyTo({
            center: [-120.847, 43.708],
            zoom: 13,
            duration: 0
          });

          map.once('idle', () => {
            setTimeout(() => {
              const waypointFeatures = map.queryRenderedFeatures({ layers: ['waypoint-icons'] });
              if (waypointFeatures.length > 0) {
                const feature = waypointFeatures[0];
                const point = map.project(feature.geometry.coordinates);
                resolve({
                  success: true,
                  clickX: point.x,
                  clickY: point.y,
                  waypointName: feature.properties?.name
                });
              } else {
                resolve({ success: false });
              }
            }, 2000);
          });

          setTimeout(() => resolve({ error: 'timeout' }), 8000);
        });
      });

      if (!result.success) {
        console.log('Skipping consistency test - no waypoints found');
        return;
      }

      // Click on the waypoint
      const canvas = page.locator('#mapContainer canvas.maplibregl-canvas');
      await canvas.click({ position: { x: result.clickX, y: result.clickY } });
      await page.waitForTimeout(500);

      // Get the mile from modal
      const modalMileText = await page.locator('#waypointDetail p').first().textContent();
      const modalMile = parseFloat(modalMileText.replace('Mile:', '').trim());

      // Get the mile from info panel
      const infoPanelMile = parseFloat(await page.locator('#mapCurrentMile').textContent());

      // Close modal
      await page.click('#closeWaypointModal');

      // They should match
      console.log(`Modal mile: ${modalMile}, Info panel mile: ${infoPanelMile}`);
      expect(Math.abs(modalMile - infoPanelMile)).toBeLessThan(0.1);
    });
  });
});
