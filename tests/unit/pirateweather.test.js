import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { parseLatLonQuery, fetchForecast, fetchUsage } = require('../../lib/pirateweather.js');

const responseWithHeaders = ({ ok = true, status = 200, body = {}, headers = {} } = {}) => ({
  ok,
  status,
  headers: {
    get: (name) => headers[name.toLowerCase()] ?? null
  },
  json: vi.fn(() => Promise.resolve(body))
});

describe('parseLatLonQuery', () => {
  it('accepts numeric string coordinates', () => {
    expect(parseLatLonQuery({ lat: '36.36', lon: '-106.05' })).toEqual({
      ok: true,
      lat: 36.36,
      lon: -106.05
    });
  });

  it('rejects missing and out-of-range coordinates', () => {
    expect(parseLatLonQuery({ lat: '', lon: '-106' })).toMatchObject({ ok: false, status: 400 });
    expect(parseLatLonQuery({ lat: '91', lon: '-106' }).error).toContain('lat');
    expect(parseLatLonQuery({ lat: '36', lon: '-181' }).error).toContain('lon');
  });
});

describe('fetchForecast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the PirateWeather URL and adapts current, daily, hourly, and usage data', async () => {
    const response = responseWithHeaders({
      headers: {
        'x-forecast-api-calls': '12',
        'ratelimit-limit': '1000',
        'ratelimit-remaining': '988'
      },
      body: {
        currently: {
          time: 1700000000,
          summary: 'Clear',
          icon: 'clear-day',
          temperature: 72,
          apparentTemperature: 70,
          windSpeed: 8,
          windGust: 18,
          humidity: 0.22
        },
        daily: {
          data: Array.from({ length: 8 }, (_, i) => ({
            time: 1700000000 + i * 86400,
            temperatureHigh: 70 + i,
            temperatureLow: 40 + i,
            icon: i === 1 ? '' : 'clear-day',
            summary: `Day ${i}`
          }))
        },
        hourly: {
          data: Array.from({ length: 170 }, (_, i) => ({
            time: 1700000000 + i * 3600,
            temperature: 50 + i,
            icon: i === 0 ? '' : 'cloudy',
            precipProbability: i === 0 ? undefined : 0.2,
            precipIntensity: i === 0 ? undefined : 0.01,
            windSpeed: i === 0 ? undefined : 5,
            summary: `Hour ${i}`
          }))
        }
      }
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const result = await fetchForecast({ apiKey: 'test-key', lat: 36.36, lon: -106.05, timeoutMs: 50 });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toBe('/forecast/test-key/36.36,-106.05');
    expect(url.searchParams.get('exclude')).toBe('minutely,alerts');
    expect(url.searchParams.get('units')).toBe('us');
    expect(url.searchParams.get('extend')).toBe('hourly');
    expect(result.body.daily).toHaveLength(7);
    expect(result.body.hourly).toHaveLength(168);
    expect(result.body.daily[1].icon).toBe('');
    expect(result.body.hourly[0]).toMatchObject({
      icon: '',
      precipProbability: 0,
      precipIntensity: 0,
      precipType: 'none',
      windSpeed: 0
    });
    expect(result.body._usage).toEqual({ calls: 12, limit: 1000, remaining: 988 });
  });

  it('returns an upstream error for non-ok responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithHeaders({ ok: false, status: 429 }));

    const result = await fetchForecast({ apiKey: 'test-key', lat: 36, lon: -106, timeoutMs: 50 });

    expect(result).toEqual({
      ok: false,
      status: 429,
      body: { error: 'PirateWeather API error', status: 429 }
    });
  });

  it('maps aborted requests to a timeout response', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const result = await fetchForecast({ apiKey: 'test-key', lat: 36, lon: -106, timeoutMs: 50 });

    expect(result).toEqual({
      ok: false,
      status: 504,
      body: { error: 'PirateWeather request timed out.' }
    });
  });
});

describe('fetchUsage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the lightweight usage query and parses headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithHeaders({
      headers: {
        'x-forecast-api-calls': '321',
        'x-response-time': '27ms'
      }
    }));

    const result = await fetchUsage({ apiKey: 'test-key', timeoutMs: 50 });

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { apiCalls: 321, responseTime: '27ms' }
    });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toBe('/forecast/test-key/44.0582,-121.3153');
    expect(url.searchParams.get('exclude')).toBe('minutely,hourly,daily,alerts');
  });

  it('keeps unparsable usage headers as null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithHeaders({
      headers: { 'x-forecast-api-calls': 'unknown' }
    }));

    const result = await fetchUsage({ apiKey: 'test-key', timeoutMs: 50 });

    expect(result.body.apiCalls).toBeNull();
    expect(result.body.responseTime).toBeNull();
  });
});
