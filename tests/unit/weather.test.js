import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [TEST] Added: unit tests for weather.js — previously had zero unit test coverage
// Tests the getIcon fallback, renderWeatherTable DOM output, and loadForecasts error handling

// Mock config.js
const mockSectionPoints = [
  { name: '1: Badlands to Sand Spring', lat: 44.045, lon: -121.038, mile: 0, elevation: 3406, section: 1 },
  { name: '2: Sand Spring to South Reservoir', lat: 43.708, lon: -120.847, mile: 36, elevation: 4944, section: 2 },
];
const mockState = { trail: { id: 'odt' } };

vi.mock('../../public/js/config.js', () => ({
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

vi.mock('../../public/js/utils.js', () => ({
  getDayHeaders: () => ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
  getSectionPoints: () => mockSectionPoints,
  state: mockState
}));

// Set up DOM before importing weather.js
document.body.innerHTML = `
  <div id="container">Loading...</div>
  <div id="apiUsage"></div>
`;

const { renderWeatherTable, loadForecasts, adaptUsgsStreamflowResponse, renderStreamflowPanel } = await import('../../public/js/weather.js');

describe('renderWeatherTable', () => {
  beforeEach(() => {
    document.getElementById('container').innerHTML = 'Loading...';
    document.getElementById('apiUsage').textContent = '';
    mockState.trail = { id: 'odt' };
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
    // 2 sections * 4 days = 8 forecast cells
    expect(cells.length).toBe(8);
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

  // [TEST] Added: verifies no temp spans when high/low are undefined
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
    // With no high/low, no temp spans should appear in the cell
    expect(firstCell.querySelector('.fc-high')).toBeNull();
    expect(firstCell.querySelector('.fc-low')).toBeNull();
  });

  // [TEST] Added: verifies elevation is formatted with locale string and foot mark
  it('displays elevation with locale formatting', () => {
    renderWeatherTable([null, null]);
    const container = document.getElementById('container');
    // 3,406 feet (with locale comma) and foot mark
    expect(container.innerHTML).toContain("3,406\u2032");
  });
});

describe('Rio Grande streamflow panel', () => {
  const gauges = [
    {
      id: '08313000',
      name: 'Otowi Bridge',
      context: 'White Rock Canyon ford',
      mile: 27.6,
      url: 'https://waterdata.usgs.gov/monitoring-location/USGS-08313000/'
    }
  ];

  beforeEach(() => {
    document.getElementById('container').innerHTML = '<table></table>';
    mockState.trail = { id: 'nnml', streamflowGauges: gauges };
  });

  it('adapts USGS discharge and stage readings by gauge', () => {
    const records = adaptUsgsStreamflowResponse({
      value: {
        timeSeries: [
          {
            sourceInfo: { siteCode: [{ value: '08313000' }] },
            variable: { variableCode: [{ value: '00060' }], unit: { unitCode: 'ft3/s' } },
            values: [{ value: [{ value: '251', dateTime: '2026-05-31T10:00:00.000-06:00', qualifiers: ['P'] }] }]
          },
          {
            sourceInfo: { siteCode: [{ value: '08313000' }] },
            variable: { variableCode: [{ value: '00065' }], unit: { unitCode: 'ft' } },
            values: [{ value: [{ value: '2.41', dateTime: '2026-05-31T10:00:00.000-06:00', qualifiers: ['P'] }] }]
          }
        ]
      }
    }, gauges);

    expect(records).toHaveLength(1);
    expect(records[0].discharge.value).toBe(251);
    expect(records[0].stage.value).toBe(2.41);
    expect(records[0].provisional).toBe(true);
  });

  it('renders a Rio Grande flow card above the forecast table', () => {
    renderStreamflowPanel([
      {
        ...gauges[0],
        discharge: { value: 251, unit: 'ft3/s', dateTime: '2026-05-31T10:00:00.000-06:00' },
        stage: { value: 2.41, unit: 'ft', dateTime: '2026-05-31T10:00:00.000-06:00' },
        observedAt: '2026-05-31T10:00:00.000-06:00',
        provisional: true
      }
    ]);

    const panel = document.querySelector('.streamflow-panel');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Rio Grande Flow');
    expect(panel.textContent).toContain('Otowi Bridge');
    expect(panel.textContent).toContain('251');
    expect(panel.textContent).toContain('cfs');
    expect(panel.textContent).toContain('Stage 2.41 ft');
  });
});

describe('loadForecasts', () => {
  beforeEach(() => {
    document.getElementById('container').innerHTML = 'Loading...';
    document.getElementById('apiUsage').textContent = '';
    localStorage.clear();
    mockState.trail = { id: 'odt' };
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day', summary: 'Clear' }),
        hourly: [],
        _usage: { calls: 150, limit: 25000, remaining: 24850 }
      })
    });

    await loadForecasts();

    const usage = document.getElementById('apiUsage');
    expect(usage.textContent).toContain('150');
    expect(usage.textContent).toContain('25,000');
    expect(fetchSpy).toHaveBeenCalledWith('/api/forecast?lat=44.045&lon=-121.038');
    expect(fetchSpy).toHaveBeenCalledWith('/api/forecast?lat=43.708&lon=-120.847');
  });

  // [TEST] Added: verifies API usage not shown when _usage.calls is null
  it('does not display usage when _usage.calls is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day' }),
        hourly: [],
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
    expect(container.innerHTML).toContain('fc-high">88°');
    expect(container.innerHTML).toContain('fc-low">66°');
    expect(container.textContent).toContain('Offline: showing cached forecast');
  });

  it('stores forecasts in cache after successful load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        daily: Array(7).fill({ high: 70, low: 50, icon: 'clear-day', summary: 'Clear' }),
        hourly: [],
        _usage: { calls: null, limit: null, remaining: null }
      })
    });

    await loadForecasts();

    const cached = JSON.parse(localStorage.getItem('odtForecastCacheV1'));
    expect(Array.isArray(cached.forecasts)).toBe(true);
    expect(cached.forecasts.length).toBe(2);
    expect(Number.isFinite(cached.savedAt)).toBe(true);
  });

  it('uses cached data only for sections that fail to refresh', async () => {
    localStorage.setItem('odtForecastCacheV1', JSON.stringify({
      savedAt: 1700000000000,
      forecasts: [
        null,
        {
          daily: [
            { high: 61, low: 39, icon: 'rain', summary: 'Cached wet' },
            ...Array(6).fill({ high: 63, low: 41, icon: 'cloudy', summary: 'Cached cloudy' })
          ]
        }
      ]
    }));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          daily: [{ high: 80, low: 50, icon: 'clear-day', summary: 'Live clear' }],
          hourly: [],
          _usage: { calls: null, limit: null, remaining: null }
        })
      })
      .mockRejectedValueOnce(new Error('Network error'));

    await loadForecasts();

    const container = document.getElementById('container');
    expect(container.innerHTML).toContain('fc-high">80°');
    expect(container.innerHTML).toContain('fc-high">61°');
    expect(container.textContent).toContain('Some sections failed to refresh; using cached forecast');
  });
});
