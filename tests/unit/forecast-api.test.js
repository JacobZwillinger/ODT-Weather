import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [TEST] Added: unit tests for api/forecast.js — previously had zero unit test coverage
// Tests parameter validation, error handling, response shaping, and API key checks

// We need to test the handler as a CommonJS module exported function.
// We'll dynamically require it after setting up env.

describe('api/forecast handler', () => {
  let handler;
  let originalEnv;

  beforeEach(async () => {
    originalEnv = process.env.PIRATEWEATHER_API_KEY;
    // Reset module cache for each test
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PIRATEWEATHER_API_KEY = originalEnv;
    } else {
      delete process.env.PIRATEWEATHER_API_KEY;
    }
    vi.restoreAllMocks();
  });

  const createMockReq = (query = {}) => ({
    query
  });

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      _jsonData: null,
      _headers: {},
      json: vi.fn(function(data) { res._jsonData = data; return res; }),
      setHeader: vi.fn(function(key, val) { res._headers[key] = val; }),
    };
    return res;
  };

  // [TEST] Added: verifies 500 error when API key is missing
  it('returns 500 when PIRATEWEATHER_API_KEY is missing', async () => {
    delete process.env.PIRATEWEATHER_API_KEY;
    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: '44.0', lon: '-121.0' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res._jsonData.error).toContain('Missing');
  });

  // [TEST] Added: verifies 400 error when lat/lon params are missing
  it('returns 400 when lat and lon are missing', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';
    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({});
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._jsonData.error).toContain('lat and lon');
  });

  // [TEST] Added: verifies 400 error when lat is NaN
  it('returns 400 when lat is not a number', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';
    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: 'abc', lon: '-121.0' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  // [TEST] Added: verifies successful response is shaped correctly with daily array
  it('returns shaped forecast data on success', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';

    const mockApiResponse = {
      currently: {
        time: 1234567890,
        summary: 'Clear',
        icon: 'clear-day',
        temperature: 75,
        apparentTemperature: 73,
        windSpeed: 5,
        windGust: 10,
        humidity: 0.3,
      },
      daily: {
        data: [
          { time: 1234567890, temperatureHigh: 85, temperatureLow: 45, icon: 'clear-day', summary: 'Clear' },
          { time: 1234654290, temperatureHigh: 80, temperatureLow: 42, icon: 'rain', summary: 'Rain' },
        ]
      }
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn((name) => {
          if (name === 'x-forecast-api-calls') return '150';
          if (name === 'ratelimit-limit') return '25000';
          if (name === 'ratelimit-remaining') return '24850';
          return null;
        })
      },
      json: () => Promise.resolve(mockApiResponse),
    });

    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: '44.045', lon: '-121.038' });
    const res = createMockRes();

    await handler(req, res);

    expect(res._jsonData).toHaveProperty('daily');
    expect(res._jsonData.daily).toHaveLength(2);
    expect(res._jsonData.daily[0].high).toBe(85);
    expect(res._jsonData.daily[0].low).toBe(45);
    expect(res._jsonData._usage.calls).toBe(150);
    expect(res._jsonData._usage.limit).toBe(25000);
  });

  // [TEST] Added: verifies handler returns error when upstream API returns non-ok response
  it('returns error status when PirateWeather API returns non-ok', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Rate limited' }),
    });

    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: '44.045', lon: '-121.038' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res._jsonData.error).toContain('PirateWeather API error');
  });

  // [TEST] Added: verifies handler returns 500 when fetch throws (network error)
  it('returns 500 when fetch throws', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: '44.045', lon: '-121.038' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res._jsonData.error).toContain('Unable to reach');
  });

  // [TEST] Added: verifies Cache-Control header is set on response
  it('sets Cache-Control header', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: () => Promise.resolve({ currently: {}, daily: { data: [] } }),
    });

    const mod = await import('../../api/forecast.js');
    handler = mod.default || mod;

    const req = createMockReq({ lat: '44.045', lon: '-121.038' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age'));
  });
});
