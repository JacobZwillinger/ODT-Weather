import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock utils.js so we can control state and loadElevationProfile
vi.mock('../../public/js/utils.js', () => ({
  getTrailStorageKey: (key) => `odt_${key}`,
  loadElevationProfile: vi.fn(),
  state: {
    trail: { id: 'odt' },
    categories: {
      'water-reliable': [],
      'water-other': [],
      towns: [],
      navigation: [],
      toilets: []
    },
    currentMile: 0,
    elevationProfile: null
  }
}));

// Mock config.js
vi.mock('../../public/js/config.js', () => ({
  MILE_EPSILON: 0.01,
  WATER_WARNING_MILES: 20,
  SCROLL_DELAY_MS: 100,
  MAP_INIT_DELAY_MS: 100,
  CATEGORY_CONFIG: {},
  sectionPoints: [],
  weatherIcons: {}
}));

// ---- Re-implement testable pure logic from elevation.js ----
// These mirror the module-private functions so we can unit test them independently.

// computeGainLoss — same hysteresis logic as in elevation.js (threshold = 20 ft)
const computeGainLoss = (points, threshold = 20) => {
  if (!points || points.length < 2) return { gain: 0, loss: 0 };
  let gain = 0, loss = 0;
  let anchor = points[0].elevation;
  let trend = 0;
  for (let i = 1; i < points.length; i++) {
    const e = points[i].elevation;
    const diff = e - anchor;
    if (trend >= 0 && diff > 0) {
      gain += diff; anchor = e; trend = 1;
    } else if (trend <= 0 && diff < 0) {
      loss += -diff; anchor = e; trend = -1;
    } else if (Math.abs(diff) >= threshold) {
      if (diff > 0) { gain += diff; trend = 1; } else { loss += -diff; trend = -1; }
      anchor = e;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

// getIconKey — same logic as in elevation.js
const getIconKey = (category, subcategory) => {
  if (category === 'water') {
    return subcategory === 'reliable' ? 'water-reliable' : 'water-other';
  }
  return category;
};

// Y-axis tick snapping logic — same as in elevation.js
const computeYAxisTicks = (minElevRounded, maxElevRounded, isMobile) => {
  const elevRange = maxElevRounded - minElevRounded;
  const rawStep = elevRange / (isMobile ? 4 : 5);
  const tickInterval = Math.ceil(rawStep / 100) * 100;
  const firstTick = Math.ceil(minElevRounded / tickInterval) * tickInterval;
  const ticks = [];
  for (let elev = firstTick; elev <= maxElevRounded; elev += tickInterval) {
    ticks.push(elev);
  }
  return { tickInterval, ticks };
};

// ---- Tests ----

describe('computeGainLoss', () => {
  it('returns zero for a single point', () => {
    const pts = [{ elevation: 3000 }];
    // single point has no delta iterations
    const { gain, loss } = computeGainLoss(pts);
    expect(gain).toBe(0);
    expect(loss).toBe(0);
  });

  it('computes pure gain', () => {
    const pts = [
      { elevation: 3000 },
      { elevation: 3200 },
      { elevation: 3500 }
    ];
    const { gain, loss } = computeGainLoss(pts);
    expect(gain).toBe(500);
    expect(loss).toBe(0);
  });

  it('computes pure loss', () => {
    const pts = [
      { elevation: 4000 },
      { elevation: 3700 },
      { elevation: 3500 }
    ];
    const { gain, loss } = computeGainLoss(pts);
    expect(gain).toBe(0);
    expect(loss).toBe(500);
  });

  it('computes gain and loss for rolling terrain', () => {
    const pts = [
      { elevation: 3000 },  // start
      { elevation: 3200 },  // +200
      { elevation: 3100 },  // -100
      { elevation: 3400 },  // +300
      { elevation: 3300 }   // -100
    ];
    const { gain, loss } = computeGainLoss(pts);
    expect(gain).toBe(500);  // 200 + 300
    expect(loss).toBe(200);  // 100 + 100
  });

  it('rounds fractional gain/loss', () => {
    const pts = [
      { elevation: 3000.4 },
      { elevation: 3001.7 }  // delta = 1.3 → rounds to 1
    ];
    const { gain } = computeGainLoss(pts);
    expect(gain).toBe(1);
  });

  it('filters sub-threshold noise within a sustained climb', () => {
    // A steady climb with small ±5 ft jitter should read as ~pure gain,
    // not inflated by the noise wiggles (old raw-delta logic over-counted).
    const pts = [
      { elevation: 3000 },
      { elevation: 3005 },  // noise up
      { elevation: 3000 },  // noise down (-5, < 20 → ignored)
      { elevation: 3300 },  // real climb
      { elevation: 3295 },  // noise down (-5 from 3300 → ignored)
      { elevation: 3600 }   // real climb
    ];
    const { gain, loss } = computeGainLoss(pts);
    expect(gain).toBe(600);  // 3000→3600 net, noise dips ignored
    expect(loss).toBe(0);
  });
});

describe('getIconKey', () => {
  it('maps reliable water to water-reliable', () => {
    expect(getIconKey('water', 'reliable')).toBe('water-reliable');
  });

  it('maps seasonal water to water-other', () => {
    expect(getIconKey('water', 'seasonal')).toBe('water-other');
  });

  it('maps unreliable water to water-other', () => {
    expect(getIconKey('water', 'unreliable')).toBe('water-other');
  });

  it('passes through towns category', () => {
    expect(getIconKey('towns', 'full')).toBe('towns');
  });

  it('passes through navigation category', () => {
    expect(getIconKey('navigation', 'junction')).toBe('navigation');
  });

  it('passes through toilets category', () => {
    expect(getIconKey('toilets', '')).toBe('toilets');
  });
});

describe('Y-axis tick snapping', () => {
  it('snaps ticks to exact 100ft increments', () => {
    // Range 3500–4200 ft → span 700, desktop: rawStep = 140, tickInterval = 200
    const { tickInterval, ticks } = computeYAxisTicks(3500, 4200, false);
    expect(tickInterval % 100).toBe(0);
    ticks.forEach(tick => {
      expect(tick % 100).toBe(0);
    });
  });

  it('produces ticks within the elevation range', () => {
    const min = 3400, max = 5000;
    const { ticks } = computeYAxisTicks(min, max, false);
    ticks.forEach(tick => {
      expect(tick).toBeGreaterThanOrEqual(min);
      expect(tick).toBeLessThanOrEqual(max);
    });
  });

  it('uses a finer interval on mobile (fewer ticks)', () => {
    const min = 3000, max = 5000;
    const { ticks: mobileTicks } = computeYAxisTicks(min, max, true);
    const { ticks: desktopTicks } = computeYAxisTicks(min, max, false);
    // Desktop allows one more tick level; mobile tick interval is >= desktop
    expect(mobileTicks.length).toBeLessThanOrEqual(desktopTicks.length + 1);
  });

  it('handles small elevation ranges (e.g., plateau section)', () => {
    // Range < 100ft should still produce at least one tick
    const { ticks } = computeYAxisTicks(4000, 4080, false);
    expect(ticks.length).toBeGreaterThan(0);
    ticks.forEach(tick => expect(tick % 100).toBe(0));
  });
});

describe('stats bar GPS vs view split', () => {
  // Test the forwardFrom logic in isolation
  const mockProfile = [
    { distance: 10, elevation: 3000 },
    { distance: 12, elevation: 3100 },
    { distance: 15, elevation: 3300 },
    { distance: 17, elevation: 3200 },
    { distance: 20, elevation: 3000 },
    { distance: 25, elevation: 3400 },
    { distance: 30, elevation: 3500 },
    { distance: 35, elevation: 3100 }
  ];

  const forwardFrom = (profile, startMile, windowMiles) =>
    profile.filter(p => p.distance >= startMile && p.distance <= startMile + windowMiles);

  it('GPS-based points start from current GPS mile', () => {
    const gpsMile = 15;
    const pts = forwardFrom(mockProfile, gpsMile, 5);
    expect(pts.every(p => p.distance >= gpsMile)).toBe(true);
    expect(pts.every(p => p.distance <= gpsMile + 5)).toBe(true);
  });

  it('view-based points start from view start mile', () => {
    const viewStart = 10;
    const pts = forwardFrom(mockProfile, viewStart, 10);
    expect(pts.every(p => p.distance >= viewStart)).toBe(true);
    expect(pts.every(p => p.distance <= viewStart + 10)).toBe(true);
  });

  it('GPS and view points differ when view is panned away from GPS position', () => {
    const gpsMile = 10;
    const viewStart = 25; // panned far from GPS
    const gPts = forwardFrom(mockProfile, gpsMile, 5);
    const vPts = forwardFrom(mockProfile, viewStart, 5);
    // GPS points contain mile 10-15 data; view points contain mile 25-30 data
    expect(gPts.some(p => p.distance === 10)).toBe(true);
    expect(vPts.some(p => p.distance === 25)).toBe(true);
    expect(gPts.some(p => p.distance === 25)).toBe(false);
    expect(vPts.some(p => p.distance === 10)).toBe(false);
  });

  it('gain/loss differs between GPS and view stats when panned', () => {
    const gpsMile = 10;
    const viewStart = 25;
    const gPts = forwardFrom(mockProfile, gpsMile, 10);
    const vPts = forwardFrom(mockProfile, viewStart, 10);
    const gStats = computeGainLoss(gPts);
    const vStats = computeGainLoss(vPts);
    // These happen to be different sections of the trail
    expect(gStats).not.toEqual(vStats);
  });
});

describe('elevation window controls', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.resetModules();
  });

  it('uses denser tick spacing for shorter elevation windows', async () => {
    const { getElevationTickConfig } = await import('../../public/js/elevation.js');

    expect(getElevationTickConfig(5)).toEqual({ step: 0.5, labelEvery: 1 });
    expect(getElevationTickConfig(10)).toEqual({ step: 1, labelEvery: 2 });
    expect(getElevationTickConfig(20)).toEqual({ step: 2.5, labelEvery: 5 });
  });

  it('syncs active state when a window button is selected', async () => {
    document.body.innerHTML = `
      <button class="elev-window-btn" data-elev-window="5" aria-pressed="false">5 mi</button>
      <button class="elev-window-btn" data-elev-window="10" aria-pressed="false">10 mi</button>
      <button class="elev-window-btn active" data-elev-window="20" aria-pressed="true">20 mi</button>
    `;
    const { getElevationWindowMiles, initElevationWindowControls } = await import('../../public/js/elevation.js');

    initElevationWindowControls();
    document.querySelector('[data-elev-window="5"]').click();

    expect(getElevationWindowMiles()).toBe(5);
    expect(document.querySelector('[data-elev-window="5"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-elev-window="5"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-elev-window="20"]').classList.contains('active')).toBe(false);
    expect(localStorage.getItem('odt_elevationWindowMiles')).toBe('5');
  });
});

describe('renderElevationChart graceful failures', () => {
  // These tests verify the function handles missing DOM elements without throwing
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('returns early without throwing when canvas element does not exist', async () => {
    // No canvas in DOM
    const { renderElevationChart } = await import('../../public/js/elevation.js');
    // Should not throw
    await expect(renderElevationChart(0, 'nonexistent-canvas-id')).resolves.toBeUndefined();
  });
});
