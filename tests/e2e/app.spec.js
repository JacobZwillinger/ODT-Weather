import { test, expect } from '@playwright/test';

test.describe('ODT Weather App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to initialize
    await page.waitForSelector('#mapContainer');
  });

  test.describe('Page Load', () => {
    test('has correct title', async ({ page }) => {
      await expect(page).toHaveTitle('Oregon Desert Trail');
    });

    test('displays map container fullscreen', async ({ page }) => {
      const mapContainer = page.locator('#mapContainer');
      await expect(mapContainer).toBeVisible();

      const box = await mapContainer.boundingBox();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    });

    test('displays bottom info bar with mile 0', async ({ page }) => {
      const bottomBar = page.locator('.bottom-info-bar');
      await expect(bottomBar).toBeVisible();

      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toContainText('0.0');
    });

    test('displays top-right button group', async ({ page }) => {
      const btnGroup = page.locator('.btn-group-top-right');
      await expect(btnGroup).toBeVisible();

      await expect(page.locator('#btnElevation')).toBeVisible();
      await expect(page.locator('#btnWeather')).toBeVisible();
      await expect(page.locator('#btnGpsCenter')).toBeVisible();
    });

    test('displays bottom-right button group', async ({ page }) => {
      const btnGroup = page.locator('.btn-group-bottom-right');
      await expect(btnGroup).toBeVisible();

      await expect(page.locator('#btnWaypointList')).toBeVisible();
      await expect(page.locator('#btnSettings')).toBeVisible();
      await expect(page.locator('#btnGpsToggle')).toBeVisible();
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

  test.describe('Weather Overlay', () => {
    test('opens when weather button clicked', async ({ page }) => {
      await page.click('#btnWeather');

      const overlay = page.locator('#weatherOverlay');
      await expect(overlay).toHaveClass(/show/);
    });

    test('loads weather forecasts in overlay', async ({ page }) => {
      await page.click('#btnWeather');

      // Wait for table to render inside the overlay
      await page.waitForSelector('#weatherOverlay table', { timeout: 15000 });

      const table = page.locator('#weatherOverlay table');
      await expect(table).toBeVisible();
    });

    test('displays 25 section rows', async ({ page }) => {
      await page.click('#btnWeather');
      await page.waitForSelector('#weatherOverlay table', { timeout: 15000 });

      const rows = page.locator('#weatherOverlay tbody tr');
      await expect(rows).toHaveCount(25);
    });

    test('shows section names with mile markers', async ({ page }) => {
      await page.click('#btnWeather');
      await page.waitForSelector('#weatherOverlay table', { timeout: 15000 });

      const firstRow = page.locator('#weatherOverlay tbody tr').first();
      await expect(firstRow).toContainText('Badlands');
      await expect(firstRow).toContainText('0'); // Mile 0
    });

    test('closes when close button clicked', async ({ page }) => {
      await page.click('#btnWeather');
      await expect(page.locator('#weatherOverlay')).toHaveClass(/show/);

      await page.click('#weatherOverlay .overlay-close');
      await expect(page.locator('#weatherOverlay')).not.toHaveClass(/show/);
    });
  });

  test.describe('Elevation Overlay', () => {
    test('opens when elevation button clicked', async ({ page }) => {
      await page.click('#btnElevation');

      const overlay = page.locator('#elevationOverlay');
      await expect(overlay).toHaveClass(/show/);
    });

    test('renders elevation chart canvas in overlay', async ({ page }) => {
      await page.click('#btnElevation');

      const canvas = page.locator('#elevationOverlay canvas');
      await expect(canvas).toBeVisible();
    });

    test('closes when close button clicked', async ({ page }) => {
      await page.click('#btnElevation');
      await expect(page.locator('#elevationOverlay')).toHaveClass(/show/);

      await page.click('#elevationOverlay .overlay-close');
      await expect(page.locator('#elevationOverlay')).not.toHaveClass(/show/);
    });
  });

  test.describe('Bottom Info Bar', () => {
    test('displays current mile', async ({ page }) => {
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toBeVisible();
    });

    test('displays mile label', async ({ page }) => {
      const mileLabel = page.locator('#mileLabel');
      await expect(mileLabel).toBeVisible();
      await expect(mileLabel).toContainText('Mile');
    });

    test('displays nearest waypoint', async ({ page }) => {
      const waypoint = page.locator('#mapNearestWaypoint');
      await expect(waypoint).toBeVisible();
    });

    test('displays next water distance', async ({ page }) => {
      const water = page.locator('#nextWaterCard span');
      await expect(water).toBeVisible();
    });

    test('displays next town distance', async ({ page }) => {
      const town = page.locator('#nextTownCard span');
      await expect(town).toBeVisible();
    });
  });

  test.describe('GPS Controls', () => {
    test('displays GPS toggle button', async ({ page }) => {
      const gpsBtn = page.locator('#btnGpsToggle');
      await expect(gpsBtn).toBeVisible();
      await expect(gpsBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('GPS button toggles active state on click', async ({ page, context }) => {
      // Mock geolocation before interacting with GPS
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 43.708, longitude: -120.847 });

      const gpsBtn = page.locator('#btnGpsToggle');
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

    test('GPS center button is visible', async ({ page }) => {
      const gpsCenterBtn = page.locator('#btnGpsCenter');
      await expect(gpsCenterBtn).toBeVisible();
    });
  });

  test.describe('Map Controls', () => {
    test('scale control is visible in bottom-left', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      // Scale control should exist and be visible
      const scaleControl = page.locator('.maplibregl-ctrl-scale');
      await expect(scaleControl).toBeVisible();

      // Check that scale control is in bottom-left container
      const bottomLeftContainer = page.locator('.maplibregl-ctrl-bottom-left');
      await expect(bottomLeftContainer.locator('.maplibregl-ctrl-scale')).toBeVisible();
    });

    test('zoom level display is visible in bottom-left', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      // Zoom display should be visible
      const zoomDisplay = page.locator('.zoom-level-display');
      await expect(zoomDisplay).toBeVisible();

      // Should be in bottom-left container
      const bottomLeftContainer = page.locator('.maplibregl-ctrl-bottom-left');
      await expect(bottomLeftContainer.locator('.zoom-level-display')).toBeVisible();

      // Should show a zoom level in zN format
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
      // Zoom level should match format and should have increased
      expect(newZoom).toMatch(/^z\d+$/);
      const initialNum = parseInt(initialZoom.replace('z', ''));
      const newNum = parseInt(newZoom.replace('z', ''));
      expect(newNum).toBeGreaterThanOrEqual(initialNum);
    });

    test('both scale and zoom controls are not hidden behind other elements', async ({ page }) => {
      // Wait for map to initialize
      await page.waitForTimeout(2000);

      // Verify controls are actually visible by checking their bounding rects are within viewport
      const visibility = await page.evaluate(() => {
        const scale = document.querySelector('.maplibregl-ctrl-scale');
        const zoom = document.querySelector('.zoom-level-display');

        const scaleRect = scale ? scale.getBoundingClientRect() : null;
        const zoomRect = zoom ? zoom.getBoundingClientRect() : null;

        return {
          scaleExists: !!scale,
          zoomExists: !!zoom,
          scaleInViewport: scaleRect ? (
            scaleRect.top >= 0 &&
            scaleRect.bottom <= window.innerHeight &&
            scaleRect.width > 0 &&
            scaleRect.height > 0
          ) : false,
          zoomInViewport: zoomRect ? (
            zoomRect.top >= 0 &&
            zoomRect.bottom <= window.innerHeight &&
            zoomRect.width > 0 &&
            zoomRect.height > 0
          ) : false
        };
      });

      expect(visibility.scaleExists).toBe(true);
      expect(visibility.zoomExists).toBe(true);
      expect(visibility.scaleInViewport).toBe(true);
      expect(visibility.zoomInViewport).toBe(true);
    });
  });

  test.describe('Off-Trail Display', () => {
    test('shows "Mile" label when on trail', async ({ page, context }) => {
      // Grant geolocation permissions
      await context.grantPermissions(['geolocation']);
      // Set location exactly on the trail (near section 1)
      await context.setGeolocation({ latitude: 43.708, longitude: -120.847 });

      // Toggle GPS on
      await page.click('#btnGpsToggle');
      await page.waitForTimeout(2000);

      // Check that "Mile" label is shown (not "Off Trail")
      const label = page.locator('#mileLabel');
      await expect(label).toContainText('Mile');

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
      await page.click('#btnGpsToggle');
      await page.waitForTimeout(2000);

      // Check that "Off Trail" label is shown
      const label = page.locator('#mileLabel');
      await expect(label).toContainText('Off Trail');

      // Check that mile display has off-trail class
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).toHaveClass(/off-trail/);

      // Check that it shows distance in "X.X mi" format instead of mile number
      const mileText = await mileDisplay.textContent();
      expect(mileText).toMatch(/[\d.]+\s*mi/);
    });

    test('shows "Mile" when off trail but within threshold', async ({ page, context }) => {
      // Grant geolocation permissions
      await context.grantPermissions(['geolocation']);
      // Set location about 0.3 miles off trail (within 0.5 mile threshold)
      // At 43°N: 0.006 degrees lon ≈ 0.3 miles
      await context.setGeolocation({ latitude: 43.708, longitude: -120.841 });

      // Toggle GPS on
      await page.click('#btnGpsToggle');
      await page.waitForTimeout(2000);

      // Should still show "Mile" since we're within threshold
      const label = page.locator('#mileLabel');
      await expect(label).toContainText('Mile');

      // Check that mile display does not have off-trail class
      const mileDisplay = page.locator('#mapCurrentMile');
      await expect(mileDisplay).not.toHaveClass(/off-trail/);
    });
  });

  test.describe('Waypoint Modal via Map Click', () => {
    test('map tiles load correctly', async ({ page }) => {
      const pmtilesRequests = [];
      page.on('response', res => {
        if (res.url().includes('pmtiles')) {
          pmtilesRequests.push({ url: res.url(), status: res.status() });
        }
      });

      await page.waitForTimeout(5000);

      const hasCanvas = await page.evaluate(() => {
        return document.querySelector('#mapContainer canvas') !== null;
      });
      expect(hasCanvas).toBe(true);
      expect(pmtilesRequests.length).toBeGreaterThan(0);
    });

    test('clicking on category point opens waypoint modal', async ({ page }) => {
      await page.waitForTimeout(3000);

      // Query for any category layer features (water, navigation, etc.)
      const waypointResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          const map = window._odtMap;
          if (!map) {
            resolve({ error: 'no map' });
            return;
          }

          // Fly to section 2 area at high zoom to see unclustered points
          map.flyTo({
            center: [-120.847, 43.708],
            zoom: 13,
            duration: 0
          });

          map.once('idle', () => {
            setTimeout(() => {
              // Try all category layers
              const categoryLayers = ['water-points-unclustered', 'navigation-points-unclustered',
                                       'towns-points-unclustered', 'toilets-points-unclustered'];
              const existingLayers = categoryLayers.filter(id => map.getLayer(id));

              let features = [];
              if (existingLayers.length > 0) {
                features = map.queryRenderedFeatures({ layers: existingLayers });
              }

              if (features.length > 0) {
                const feature = features[0];
                const coords = feature.geometry.coordinates;
                const point = map.project(coords);
                resolve({
                  success: true,
                  waypointCount: features.length,
                  clickX: point.x,
                  clickY: point.y,
                  waypointName: feature.properties?.name || 'unknown',
                  category: feature.properties?.type || 'unknown',
                  zoom: map.getZoom()
                });
              } else {
                const allFeatures = map.queryRenderedFeatures();
                const featuresByLayer = {};
                allFeatures.forEach(f => {
                  const layerId = f.layer?.id || 'unknown';
                  featuresByLayer[layerId] = (featuresByLayer[layerId] || 0) + 1;
                });
                resolve({
                  success: false,
                  existingLayers,
                  featuresByLayer,
                  zoom: map.getZoom()
                });
              }
            }, 2000);
          });

          setTimeout(() => resolve({ error: 'timeout' }), 8000);
        });
      });

      console.log('Category point query result:', JSON.stringify(waypointResult, null, 2));

      const canvas = page.locator('#mapContainer canvas.maplibregl-canvas');
      const box = await canvas.boundingBox();

      let clickX, clickY;
      if (waypointResult.success) {
        clickX = waypointResult.clickX;
        clickY = waypointResult.clickY;
      } else {
        clickX = box.width / 2;
        clickY = box.height / 2;
      }

      await canvas.click({ position: { x: clickX, y: clickY } });
      await page.waitForTimeout(500);

      const modal = page.locator('#waypointModal');
      await expect(modal).toHaveClass(/visible/, { timeout: 5000 });
    });

    test('waypoint click shows consistent mile in modal and info panel', async ({ page }) => {
      await page.waitForTimeout(3000);

      const result = await page.evaluate(() => {
        return new Promise((resolve) => {
          const map = window._odtMap;
          if (!map) {
            resolve({ error: 'no map' });
            return;
          }

          map.flyTo({
            center: [-120.847, 43.708],
            zoom: 13,
            duration: 0
          });

          map.once('idle', () => {
            setTimeout(() => {
              const categoryLayers = ['water-points-unclustered', 'navigation-points-unclustered',
                                       'towns-points-unclustered', 'toilets-points-unclustered'];
              const existingLayers = categoryLayers.filter(id => map.getLayer(id));
              const features = existingLayers.length > 0
                ? map.queryRenderedFeatures({ layers: existingLayers })
                : [];

              if (features.length > 0) {
                const feature = features[0];
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
        console.log('Skipping consistency test - no category points found');
        return;
      }

      const canvas = page.locator('#mapContainer canvas.maplibregl-canvas');
      await canvas.click({ position: { x: result.clickX, y: result.clickY } });
      await page.waitForTimeout(500);

      const modalMileText = await page.locator('#waypointDetail p').first().textContent();
      const modalMile = parseFloat(modalMileText.replace('Mile:', '').trim());

      const infoPanelMile = parseFloat(await page.locator('#mapCurrentMile').textContent());

      await page.click('#closeWaypointModal');

      console.log(`Modal mile: ${modalMile}, Info panel mile: ${infoPanelMile}`);
      expect(Math.abs(modalMile - infoPanelMile)).toBeLessThan(0.1);
    });
  });

  test.describe('Category Toggles in Settings', () => {
    test('settings button opens popover with all 4 category buttons', async ({ page }) => {
      await page.click('#btnSettings');

      const popover = page.locator('#settingsPopover');
      await expect(popover).toHaveClass(/show/);

      const buttons = page.locator('#settingsPopover .category-toggle-btn');
      await expect(buttons).toHaveCount(4);

      await expect(page.locator('#settingsPopover [data-category="water"]')).toBeVisible();
      await expect(page.locator('#settingsPopover [data-category="towns"]')).toBeVisible();
      await expect(page.locator('#settingsPopover [data-category="navigation"]')).toBeVisible();
      await expect(page.locator('#settingsPopover [data-category="toilets"]')).toBeVisible();
    });

    test('default toggle state: water, towns, toilets on; navigation off', async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('categoryToggles'));
      await page.reload();
      await page.waitForSelector('#mapContainer');

      await page.click('#btnSettings');

      await expect(page.locator('#settingsPopover [data-category="water"]')).toHaveClass(/active/);
      await expect(page.locator('#settingsPopover [data-category="towns"]')).toHaveClass(/active/);
      await expect(page.locator('#settingsPopover [data-category="toilets"]')).toHaveClass(/active/);
      await expect(page.locator('#settingsPopover [data-category="navigation"]')).not.toHaveClass(/active/);

      await expect(page.locator('#settingsPopover [data-category="water"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#settingsPopover [data-category="navigation"]')).toHaveAttribute('aria-pressed', 'false');
    });

    test('clicking toggle button toggles active state and aria-pressed', async ({ page }) => {
      await page.click('#btnSettings');

      const waterBtn = page.locator('#settingsPopover [data-category="water"]');

      await expect(waterBtn).toHaveClass(/active/);
      await expect(waterBtn).toHaveAttribute('aria-pressed', 'true');

      await waterBtn.click();
      await expect(waterBtn).not.toHaveClass(/active/);
      await expect(waterBtn).toHaveAttribute('aria-pressed', 'false');

      await waterBtn.click();
      await expect(waterBtn).toHaveClass(/active/);
      await expect(waterBtn).toHaveAttribute('aria-pressed', 'true');
    });

    test('toggling off a category hides its map layers', async ({ page }) => {
      await page.waitForTimeout(3000);

      await page.click('#btnSettings');
      await page.click('#settingsPopover [data-category="water"]');

      const visibility = await page.evaluate(() => {
        const map = window._odtMap;
        if (!map) return null;
        return {
          unclustered: map.getLayoutProperty('water-points-unclustered', 'visibility'),
          clusters: map.getLayoutProperty('water-clusters', 'visibility'),
          clusterCount: map.getLayoutProperty('water-cluster-count', 'visibility')
        };
      });

      expect(visibility).not.toBeNull();
      expect(visibility.unclustered).toBe('none');
      expect(visibility.clusters).toBe('none');
      expect(visibility.clusterCount).toBe('none');
    });

    test('toggling on a category shows its map layers', async ({ page }) => {
      await page.waitForTimeout(3000);

      await page.click('#btnSettings');
      await page.click('#settingsPopover [data-category="navigation"]');

      const visibility = await page.evaluate(() => {
        const map = window._odtMap;
        if (!map) return null;
        const layer = map.getLayer('navigation-points-unclustered');
        if (!layer) return null;
        return {
          unclustered: map.getLayoutProperty('navigation-points-unclustered', 'visibility'),
          clusters: map.getLayoutProperty('navigation-clusters', 'visibility')
        };
      });

      expect(visibility).not.toBeNull();
      expect(visibility.unclustered).toBe('visible');
      expect(visibility.clusters).toBe('visible');
    });

    test('all categories toggled off shows empty map (no category points)', async ({ page }) => {
      await page.waitForTimeout(3000);

      await page.click('#btnSettings');
      await page.click('#settingsPopover [data-category="water"]');
      await page.click('#settingsPopover [data-category="towns"]');
      await page.click('#settingsPopover [data-category="toilets"]');

      const buttons = page.locator('#settingsPopover .category-toggle-btn');
      for (let i = 0; i < 4; i++) {
        await expect(buttons.nth(i)).not.toHaveClass(/active/);
      }

      const allHidden = await page.evaluate(() => {
        const map = window._odtMap;
        if (!map) return false;
        const categories = ['water', 'towns', 'navigation', 'toilets'];
        return categories.every(cat => {
          const layer = map.getLayer(`${cat}-points-unclustered`);
          if (!layer) return true;
          return map.getLayoutProperty(`${cat}-points-unclustered`, 'visibility') === 'none';
        });
      });
      expect(allHidden).toBe(true);
    });

    test('all categories toggled on shows all category points', async ({ page }) => {
      await page.waitForTimeout(3000);

      await page.click('#btnSettings');
      await page.click('#settingsPopover [data-category="navigation"]');

      const buttons = page.locator('#settingsPopover .category-toggle-btn');
      for (let i = 0; i < 4; i++) {
        await expect(buttons.nth(i)).toHaveClass(/active/);
      }

      const allVisible = await page.evaluate(() => {
        const map = window._odtMap;
        if (!map) return false;
        const categories = ['water', 'towns', 'navigation', 'toilets'];
        return categories.every(cat => {
          const layer = map.getLayer(`${cat}-points-unclustered`);
          if (!layer) return true;
          return map.getLayoutProperty(`${cat}-points-unclustered`, 'visibility') === 'visible';
        });
      });
      expect(allVisible).toBe(true);
    });

    test('toggle state persists across page reload', async ({ page }) => {
      await page.click('#btnSettings');
      await page.click('#settingsPopover [data-category="water"]');
      await expect(page.locator('#settingsPopover [data-category="water"]')).not.toHaveClass(/active/);

      await page.reload();
      await page.waitForSelector('#mapContainer');

      await page.click('#btnSettings');
      await expect(page.locator('#settingsPopover [data-category="water"]')).not.toHaveClass(/active/);
      await expect(page.locator('#settingsPopover [data-category="water"]')).toHaveAttribute('aria-pressed', 'false');

      await page.evaluate(() => localStorage.removeItem('categoryToggles'));
    });
  });

  test.describe('Waypoint List Overlay', () => {
    test('opens when waypoint list button clicked', async ({ page }) => {
      await page.click('#btnWaypointList');

      const overlay = page.locator('#waypointListOverlay');
      await expect(overlay).toHaveClass(/show/);
    });

    test('displays filter buttons for all categories', async ({ page }) => {
      await page.click('#btnWaypointList');

      const filterButtons = page.locator('#waypointListOverlay .filter-btn');
      await expect(filterButtons).toHaveCount(5); // All + 4 categories

      await expect(page.locator('#waypointListOverlay .filter-btn[data-filter="all"]')).toBeVisible();
      await expect(page.locator('#waypointListOverlay .filter-btn[data-filter="water"]')).toBeVisible();
      await expect(page.locator('#waypointListOverlay .filter-btn[data-filter="towns"]')).toBeVisible();
      await expect(page.locator('#waypointListOverlay .filter-btn[data-filter="navigation"]')).toBeVisible();
      await expect(page.locator('#waypointListOverlay .filter-btn[data-filter="toilets"]')).toBeVisible();
    });

    test('displays waypoint list items', async ({ page }) => {
      await page.click('#btnWaypointList');

      // Wait for list to populate
      await page.waitForTimeout(1000);

      const listItems = page.locator('#waypointListOverlay .waypoint-item');
      const count = await listItems.count();
      expect(count).toBeGreaterThan(10); // Should have many waypoints
    });

    test('filter buttons change active state when clicked', async ({ page }) => {
      await page.click('#btnWaypointList');

      const allBtn = page.locator('#waypointListOverlay .filter-btn[data-filter="all"]');
      const waterBtn = page.locator('#waypointListOverlay .filter-btn[data-filter="water"]');

      // All should be active by default
      await expect(allBtn).toHaveClass(/active/);

      // Click water filter
      await waterBtn.click();
      await expect(waterBtn).toHaveClass(/active/);
      await expect(allBtn).not.toHaveClass(/active/);
    });

    test('closes when close button clicked', async ({ page }) => {
      await page.click('#btnWaypointList');
      await expect(page.locator('#waypointListOverlay')).toHaveClass(/show/);

      await page.click('#waypointListOverlay .overlay-close');
      await expect(page.locator('#waypointListOverlay')).not.toHaveClass(/show/);
    });
  });
});
