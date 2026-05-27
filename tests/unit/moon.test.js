import { describe, expect, it } from 'vitest';
import { getMoonData } from '../../public/js/moon.js';

describe('getMoonData', () => {
  const bend = { lat: 44.0582, lon: -121.3153, tzOffsetMin: -420 };

  it('identifies the known January 2000 new moon', () => {
    const data = getMoonData(new Date('2000-01-06T18:14:00Z'), bend.lat, bend.lon, bend.tzOffsetMin);

    expect(data.name).toBe('New Moon');
    expect(Number.parseFloat(data.age)).toBeCloseTo(0, 1);
    expect(data.illumination).toBeLessThanOrEqual(1);
  });

  it('identifies the following full moon window with high illumination', () => {
    const data = getMoonData(new Date('2000-01-21T06:00:00Z'), bend.lat, bend.lon, bend.tzOffsetMin);

    expect(data.name).toBe('Full Moon');
    expect(data.illumination).toBeGreaterThan(95);
    expect(Number.parseFloat(data.age)).toBeGreaterThan(14);
  });

  it('returns displayable local rise and set times for trail locations', () => {
    const data = getMoonData(new Date('2026-05-27T12:00:00-06:00'), 36.36, -106.05, -360);

    expect(data.rise).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    expect(data.set).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    expect(data.age).toMatch(/^\d+\.\d$/);
    expect(data.illumination).toBeGreaterThanOrEqual(0);
    expect(data.illumination).toBeLessThanOrEqual(100);
  });

  it('handles high-latitude no-rise/no-set cases without producing bogus times', () => {
    const data = getMoonData(new Date('2026-05-27T12:00:00Z'), 89.9, 0, 0);

    expect(['Circumpolar', 'Below horizon']).toContain(data.rise);
    expect(data.set).toBe('--');
  });
});
