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
  });

  test.describe('Elevation Chart', () => {
    test('renders elevation chart canvas', async ({ page }) => {
      const canvas = page.locator('#mapElevationChart');
      await expect(canvas).toBeVisible();
    });
  });
});
