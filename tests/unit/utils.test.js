import { describe, it, expect, beforeEach } from 'vitest';
import {
  state,
  getWaypointName,
  getWaypointShortName,
  findNearestWaypoint,
  findMileFromCoords,
  findNextWater,
  findNextTown,
  getDayHeaders,
  getMapUrl,
  OFF_TRAIL_THRESHOLD
} from '../../public/js/utils.js';

describe('getWaypointName', () => {
  it('returns landmark when available', () => {
    const source = { landmark: 'Spring Creek', details: 'reliable: good flow' };
    expect(getWaypointName(source)).toBe('Spring Creek');
  });

  it('returns cleaned details when no landmark', () => {
    const source = { landmark: '', details: 'reliable: seasonal spring' };
    expect(getWaypointName(source)).toBe('seasonal spring');
  });

  it('handles whitespace-only landmark', () => {
    const source = { landmark: '   ', details: 'reliable: creek crossing' };
    expect(getWaypointName(source)).toBe('creek crossing');
  });
});

describe('getWaypointShortName', () => {
  it('extracts name before parenthetical', () => {
    const source = { landmark: 'Spring Creek (seasonal)', details: '' };
    expect(getWaypointShortName(source)).toBe('Spring Creek');
  });

  it('extracts name before slash', () => {
    const source = { landmark: 'North Fork/South Fork', details: '' };
    expect(getWaypointShortName(source)).toBe('North Fork');
  });

  it('extracts first part of details when no landmark', () => {
    const source = { landmark: '', details: 'reliable: creek, good year-round' };
    expect(getWaypointShortName(source)).toBe('creek');
  });
});

describe('findNearestWaypoint', () => {
  beforeEach(() => {
    state.allWaypoints = [
      { name: 'Start', mile: 0, lat: 44.0, lon: -121.0 },
      { name: 'Waypoint A', mile: 10.5, lat: 43.9, lon: -120.9 },
      { name: 'Waypoint B', mile: 25.0, lat: 43.7, lon: -120.8 },
      { name: 'Waypoint C', mile: 50.0, lat: 43.5, lon: -120.5 }
    ];
  });

  it('returns null when no waypoints loaded', () => {
    state.allWaypoints = [];
    expect(findNearestWaypoint(10)).toBeNull();
  });

  it('finds exact match', () => {
    const result = findNearestWaypoint(10.5);
    expect(result.waypoint.name).toBe('Waypoint A');
    expect(result.distance).toBe(0);
  });

  it('finds nearest when between waypoints', () => {
    const result = findNearestWaypoint(12);
    expect(result.waypoint.name).toBe('Waypoint A');
    expect(result.distance).toBeCloseTo(1.5);
  });

  it('finds first waypoint when before start', () => {
    const result = findNearestWaypoint(-5);
    expect(result.waypoint.name).toBe('Start');
    expect(result.distance).toBe(5);
  });

  it('finds last waypoint when past end', () => {
    const result = findNearestWaypoint(100);
    expect(result.waypoint.name).toBe('Waypoint C');
    expect(result.distance).toBe(50);
  });
});

describe('findNextWater', () => {
  beforeEach(() => {
    state.waterSources = [
      { mile: 5, name: 'Spring A' },
      { mile: 15, name: 'Creek B' },
      { mile: 30, name: 'River C' }
    ];
  });

  it('finds next water source after given mile', () => {
    const result = findNextWater(10);
    expect(result.mile).toBe(15);
  });

  it('returns null when past last water source', () => {
    const result = findNextWater(35);
    expect(result).toBeNull();
  });

  it('skips water source at exact mile (epsilon check)', () => {
    const result = findNextWater(5);
    expect(result.mile).toBe(15);
  });

  it('finds first water source from mile 0', () => {
    const result = findNextWater(0);
    expect(result.mile).toBe(5);
  });
});

describe('findNextTown', () => {
  beforeEach(() => {
    state.towns = [
      { mile: 50, name: 'Town A' },
      { mile: 150, name: 'Town B' },
      { mile: 300, name: 'Town C' }
    ];
  });

  it('finds next town after given mile', () => {
    const result = findNextTown(100);
    expect(result.mile).toBe(150);
  });

  it('returns null when past last town', () => {
    const result = findNextTown(350);
    expect(result).toBeNull();
  });
});

describe('getDayHeaders', () => {
  it('returns 7 days', () => {
    const headers = getDayHeaders();
    expect(headers).toHaveLength(7);
  });

  it('starts with today', () => {
    const headers = getDayHeaders();
    const today = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = dayNames[today.getDay()];
    expect(headers[0]).toContain(expectedDay);
  });

  it('includes date in format day, M/D', () => {
    const headers = getDayHeaders();
    // Should match pattern like "Mon, 1/29"
    expect(headers[0]).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{1,2}\/\d{1,2}$/);
  });
});

describe('getMapUrl', () => {
  it('generates correct Google Maps URL', () => {
    const url = getMapUrl(44.045, -121.038);
    expect(url).toBe('https://www.google.com/maps?q=44.045,-121.038');
  });

  it('handles negative coordinates', () => {
    const url = getMapUrl(-33.8688, 151.2093);
    expect(url).toBe('https://www.google.com/maps?q=-33.8688,151.2093');
  });
});

describe('OFF_TRAIL_THRESHOLD', () => {
  it('is set to 0.5 miles', () => {
    expect(OFF_TRAIL_THRESHOLD).toBe(0.5);
  });
});

describe('findMileFromCoords', () => {
  beforeEach(() => {
    // Mock elevation profile with known trail points
    // Oregon latitude ~43°N, 1 degree lat ≈ 69 miles, 1 degree lon ≈ 50 miles
    state.elevationProfile = [
      { lat: 43.0, lon: -120.0, distance: 0 },
      { lat: 43.1, lon: -120.0, distance: 7 },    // ~7 miles north (0.1 * 69)
      { lat: 43.2, lon: -120.0, distance: 14 },   // ~14 miles north
      { lat: 43.3, lon: -120.0, distance: 21 }    // ~21 miles north
    ];
  });

  it('returns mile and distanceFromTrail object', async () => {
    const result = await findMileFromCoords(43.0, -120.0);
    expect(result).toHaveProperty('mile');
    expect(result).toHaveProperty('distanceFromTrail');
  });

  it('returns distance 0 when on trail', async () => {
    // Exactly on a trail point
    const result = await findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBe(0);
  });

  it('returns small distance when close to trail (within threshold)', async () => {
    // About 0.2 miles east of trail (0.004 degrees lon at lat 43)
    // At 43°N: 1 degree lon ≈ 50 miles, so 0.004 degrees ≈ 0.2 miles
    const result = await findMileFromCoords(43.0, -119.996);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBeLessThan(OFF_TRAIL_THRESHOLD);
    expect(result.distanceFromTrail).toBeGreaterThan(0);
  });

  it('returns distance > threshold when significantly off trail', async () => {
    // About 1 mile east of trail (0.02 degrees lon at lat 43)
    // At 43°N: 1 degree lon ≈ 50 miles, so 0.02 degrees ≈ 1 mile
    const result = await findMileFromCoords(43.0, -119.98);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
    expect(result.distanceFromTrail).toBeCloseTo(1, 0); // ~1 mile off trail
  });

  it('finds closest trail point when between points', async () => {
    // Midway between mile 0 and mile 7
    const result = await findMileFromCoords(43.05, -120.0);
    // Should snap to nearest profile point (either 0 or 7)
    expect(result.mile === 0 || result.mile === 7).toBe(true);
    // Distance will be ~3.45 miles (0.05 degrees * 69 mi/deg) since
    // our mock profile has sparse points. This is expected behavior.
    expect(result.distanceFromTrail).toBeGreaterThan(3);
  });

  it('returns 0 when no elevation profile loaded', async () => {
    state.elevationProfile = null;
    const result = await findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBe(0);
  });

  it('returns 0 when elevation profile is empty', async () => {
    state.elevationProfile = [];
    const result = await findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBe(0);
  });
});
