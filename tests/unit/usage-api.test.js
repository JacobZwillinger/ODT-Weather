import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api/usage handler', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.PIRATEWEATHER_API_KEY;
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

  it('returns 500 when PIRATEWEATHER_API_KEY is missing', async () => {
    delete process.env.PIRATEWEATHER_API_KEY;
    const mod = await import('../../api/usage.js');
    const handler = mod.default || mod;
    const res = createMockRes();

    await handler({}, res);

    expect(res.statusCode).toBe(500);
    expect(res._jsonData.error).toContain('Missing');
  });

  it('returns parsed usage and a short cache header', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: (name) => {
          if (name === 'x-forecast-api-calls') return '42';
          if (name === 'x-response-time') return '31ms';
          return null;
        }
      },
      json: vi.fn(() => Promise.resolve({}))
    });
    const mod = await import('../../api/usage.js');
    const handler = mod.default || mod;
    const res = createMockRes();

    await handler({}, res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age=300'));
    expect(res._jsonData).toEqual({ apiCalls: 42, responseTime: '31ms' });
  });

  it('passes upstream PirateWeather errors through with status', async () => {
    process.env.PIRATEWEATHER_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: vi.fn(() => Promise.resolve({}))
    });
    const mod = await import('../../api/usage.js');
    const handler = mod.default || mod;
    const res = createMockRes();

    await handler({}, res);

    expect(res.statusCode).toBe(429);
    expect(res._jsonData).toEqual({ error: 'PirateWeather API error', status: 429 });
  });
});
