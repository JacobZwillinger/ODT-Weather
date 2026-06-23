import { describe, expect, it } from 'vitest';
import { getMoonData, getSunData } from '../../public/js/moon.js';

// Parse "H:MM AM/PM" into fractional hours (0–24) for range assertions.
const parseClock = (s) => {
  const m = s.match(/^(\d{1,2}):(\d{2}) ([AP]M)$/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  return h + Number(m[2]) / 60;
};

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

describe('getSunData', () => {
  // Santa Fe, NM at the summer solstice (MDT = UTC-6 → tzOffsetMin -360).
  // Reference: sunrise ~5:53 AM, sunset ~8:24 PM, ~14h35m of daylight.
  it('computes morning sunrise / evening sunset in the correct timezone', () => {
    const data = getSunData(new Date('2026-06-21T12:00:00-06:00'), 35.687, -105.940, -360);
    const rise = parseClock(data.sunrise);
    const set = parseClock(data.sunset);
    expect(rise).toBeGreaterThan(5);
    expect(rise).toBeLessThan(7);     // morning, not late night (guards the TZ bug)
    expect(set).toBeGreaterThan(19.5);
    expect(set).toBeLessThan(21);
    expect(data.dayLength).toBe('14h 35m');
  });

  it('shorter days in winter than summer at the same location', () => {
    const summer = getSunData(new Date('2026-06-21T12:00:00-06:00'), 35.687, -105.940, -360);
    const winter = getSunData(new Date('2026-12-21T12:00:00-06:00'), 35.687, -105.940, -360);
    const hrs = (s) => Number(s.split('h')[0]);
    expect(hrs(winter.dayLength)).toBeLessThan(hrs(summer.dayLength));
  });

  it('reports polar day/night without bogus times', () => {
    const data = getSunData(new Date('2026-06-21T12:00:00Z'), 89.9, 0, 0);
    expect(['Up all day', 'Down all day']).toContain(data.sunrise);
    expect(data.sunset).toBe('--');
  });
});
