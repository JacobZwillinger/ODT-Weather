import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [TEST] Added: unit tests for weather.js — previously had zero unit test coverage
// Tests the getIcon fallback, renderWeatherTable DOM output, and loadForecasts error handling

// Mock config.js
vi.mock('../../public/js/config.js', () => ({
  sectionPoints: [
    { name: '1: Badlands to Sand Spring', lat: 44.045, lon: -121.038, mile: 0, elevation: 3406, section: 1 },
    { name: '2: Sand Spring to South Reservoir', lat: 43.708, lon: -120.847, mile: 36, elevation: 4944, section: 2 },
  ],
  weatherIcons: {
    'clear-day': '<svg>clear-day</svg>',
    'rain': '<svg>rain</svg>',
    'cloudy': '<svg>cloudy</svg>',
  },
  MILE_EPSILON: 0.01,
  WATER_WARNING_MILES: 20,
  SCROLL_DELAY_MS: 100,
  MAP_INIT_DELAY_MS: 100,
}));

// Set up DOM before importing weather.js
document.body.innerHTML = `
  <div id="container">Loading...</div>
  <div id="apiUsage"></div>
`;

const { renderWeatherTable, loadForecasts } = await import('../../public/js/weather.js');

describe('renderWeatherTable', () => {
  beforeEach(() => {
    document.getElementById('container').innerHTML = 'Loading...';
    document.getElementById('apiUsage').textContent = '';
  });

  // [TEST] Added: verifies table renders correctly with valid forecast data
  it('renders a table with section rows', () => {
    const forecasts = [
      {
        daily: [
          { high: 85, low: 45, icon: 'clear-day', summary: 'Clear' },
          { high: 80, low: 42, icon: 'rain', summary: 'Rain' },
          { high: 78, low: 40 },
          { high: 78, low: 40 },
          { high: 78, low: 40 },
          { high: 78, low: 40 },
          { high: 78, low: 40 },
        ]
      },
      null // Second section has no data
    ];

    renderWeatherTable(forecasts);

    const container = document.getElementById('container');
    expect(container.innerHTML).toContain('<table>');
    expect(container.innerHTML).toContain('Badlands');
    expect(container.innerHTML).toContain('Sand Spring to South Reservoir');
    // Check that rows exist
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  // [TEST] Added: verifies fallback "--" rendering when forecast is null
  it('renders "--" for missing forecast data', () => {
    renderWeatherTable([null, null]);

    const container = document.getElementById('container');
    const cells = container.querySelectorAll('.forecast-cell');
    // 2 sections * 7 days = 14 forecast cells
    expect(cells.length).toBe(14);
    cells.forEach(cell => {
      expect(cell.textContent).toBe('--');
    });
  });

  // [TEST] Added: verifies fallback icon when day.icon is unrecognized
  it('uses cloudy icon as fallback for unknown icon names', () => {
    const forecasts = [
      {
        daily: [
          { high: 70, low: 50, icon: 'unknown-icon-name' },
          ...Array(6).fill({ high: 70, low: 50, icon: 'clear-day' })
        ]
      },
      null
    ];

    renderWeatherTable(forecasts);

    const container = document.getElementById('container');
    // The first cell should contain the cloudy SVG (fallback)
    const firstIcon = container.querySelector('.forecast-cell .fc-icon');
    expect(firstIcon.innerHTML).toContain('cloudy');
  });

  // [TEST] Added: verifies "--" for undefined high/low temperatures
  it('renders "--" for undefined temperature values', () => {
    const forecasts = [
      {
        daily: [
          { icon: 'clear-day' }, // no high/low
          ...Array(6).fill({ high: 70, low: 50, icon: 'clear-day' })
        ]
      },
      null
    ];

    renderWeatherTable(forecasts);

    const container = document.getElementById('container');
    const firstCell = container.querySelector('.forecast-cell');
    expect(firstCell.textContent).toContain('--');
  });

  // [TEST] Added: verifies elevation is formatted with locale string and foot mark
  it('displays elevation with locale formatting', () => {
    renderWeatherTable([null, null]);
    const container = document.getElementById('container');
    // 3,406 feet (with locale comma) and foot mark
    expect(container.innerHTML).toContain("3,406\u2032");
  });
});

describe('loadForecasts', () => {
  beforeEach(() => {
    document.getElementById('container').innerHTML = 'Loading...';
    document.getElementById('apiUsage').textContent = '';
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // [TEST] Added: verifies loadForecasts handles fetch failures gracefully (returns null per section)
  it('handles fetch errors gracefully and still renders table', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await loadForecasts();

    const container = document.getElementById('container');
    // Should still render a table (with "--" cells)
    expect(container.innerHTML).toContain('<table>');
    expect(container.textContent).toContain('Offline: no cached forecast available yet');
  });

  // [TEST] Added: verifies API usage display when _usage is present in response
  it('displays API usage when present in forecast response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day' }),
        _usage: { calls: 150, limit: 25000, remaining: 24850 }
      })
    });

    await loadForecasts();

    const usage = document.getElementById('apiUsage');
    expect(usage.textContent).toContain('150');
    expect(usage.textContent).toContain('25,000');
  });

  // [TEST] Added: verifies API usage not shown when _usage.calls is null
  it('does not display usage when _usage.calls is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day' }),
        _usage: { calls: null, limit: null, remaining: null }
      })
    });

    await loadForecasts();

    const usage = document.getElementById('apiUsage');
    expect(usage.textContent).toBe('');
  });

  // [TEST] Added: verifies loadForecasts handles non-ok HTTP responses
  it('handles non-ok HTTP responses as null forecasts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    });

    await loadForecasts();

    const container = document.getElementById('container');
    expect(container.innerHTML).toContain('<table>');
    // All cells should show "--"
    const cells = container.querySelectorAll('.forecast-cell');
    cells.forEach(cell => {
      expect(cell.textContent).toBe('--');
    });
  });

  it('uses cached forecast data when offline', async () => {
    localStorage.setItem('odtForecastCacheV1', JSON.stringify({
      savedAt: 1700000000000,
      forecasts: [
        {
          daily: [
            { high: 88, low: 66, icon: 'clear-day', summary: 'Hot' },
            ...Array(6).fill({ high: 75, low: 50, icon: 'cloudy', summary: 'Cloudy' })
          ]
        },
        {
          daily: [
            { high: 70, low: 45, icon: 'rain', summary: 'Wet' },
            ...Array(6).fill({ high: 65, low: 42, icon: 'cloudy', summary: 'Cloudy' })
          ]
        }
      ]
    }));

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await loadForecasts();

    const container = document.getElementById('container');
    expect(container.innerHTML).toContain('88° / 66°');
    expect(container.textContent).toContain('Offline: showing cached forecast');
  });

  it('stores forecasts in cache after successful load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day' }),
        _usage: { calls: 123, limit: 25000, remaining: 24877 }
      })
    });

    await loadForecasts();

    const cached = JSON.parse(localStorage.getItem('odtForecastCacheV1'));
    expect(Array.isArray(cached.forecasts)).toBe(true);
    expect(cached.forecasts.length).toBe(2);
    expect(Number.isFinite(cached.savedAt)).toBe(true);
  });
});
