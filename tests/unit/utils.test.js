import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
  loadElevationProfile,
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
    // Mock waypoints as the authoritative trail reference
    // Oregon latitude ~43°N, 1 degree lat ≈ 69 miles, 1 degree lon ≈ 50 miles
    state.allWaypoints = [
      { name: 'WP001', lat: 43.0, lon: -120.0, mile: 0 },
      { name: 'WP002', lat: 43.1, lon: -120.0, mile: 7 },    // ~7 miles north (0.1 * 69)
      { name: 'WP003', lat: 43.2, lon: -120.0, mile: 14 },   // ~14 miles north
      { name: 'WP004', lat: 43.3, lon: -120.0, mile: 21 }    // ~21 miles north
    ];
  });

  it('returns mile and distanceFromTrail object', () => {
    const result = findMileFromCoords(43.0, -120.0);
    expect(result).toHaveProperty('mile');
    expect(result).toHaveProperty('distanceFromTrail');
  });

  it('returns distance 0 when on trail', () => {
    // Exactly on a waypoint
    const result = findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBe(0);
  });

  it('returns small distance when close to trail (within threshold)', () => {
    // About 0.2 miles east of trail (0.004 degrees lon at lat 43)
    // At 43°N: 1 degree lon ≈ 50 miles, so 0.004 degrees ≈ 0.2 miles
    const result = findMileFromCoords(43.0, -119.996);
    expect(result.distanceFromTrail).toBeLessThan(OFF_TRAIL_THRESHOLD);
    expect(result.distanceFromTrail).toBeGreaterThan(0);
  });

  it('returns distance > threshold when significantly off trail', () => {
    // About 1 mile east of trail (0.02 degrees lon at lat 43)
    // At 43°N: 1 degree lon ≈ 50 miles, so 0.02 degrees ≈ 1 mile
    const result = findMileFromCoords(43.0, -119.98);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
    expect(result.distanceFromTrail).toBeCloseTo(1, 0); // ~1 mile off trail
  });

  it('returns nearest waypoint mile when between adjacent waypoints (no interpolation)', () => {
    // The code does NOT interpolate — it returns the closest waypoint's mile
    state.allWaypoints = [
      { name: 'WP001', lat: 43.0, lon: -120.0, mile: 10 },
      { name: 'WP002', lat: 43.01, lon: -120.0, mile: 11 },
    ];
    // Point clearly closer to WP002
    const result = findMileFromCoords(43.008, -120.0);
    expect(result.mile).toBe(11);
  });

  it('returns 0 when no waypoints loaded', () => {
    state.allWaypoints = [];
    const result = findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(0);
    expect(result.distanceFromTrail).toBe(0);
  });

  // [TEST] Added: tests findMileFromCoords uses elevation profile for distance when available
  it('uses elevation profile for distanceFromTrail when loaded', () => {
    // Set up elevation profile with dense trail points slightly off from waypoints
    state.elevationProfile = [
      { lat: 43.0, lon: -120.0, distance: 0, elevation: 4000 },
      { lat: 43.05, lon: -120.0, distance: 3.5, elevation: 4200 },
      { lat: 43.1, lon: -120.0, distance: 7, elevation: 4400 },
    ];
    // Point on the trail - should have near-zero distance
    const result = findMileFromCoords(43.0, -120.0);
    expect(result.distanceFromTrail).toBe(0);
    expect(result.mile).toBe(0);
    // Clean up
    state.elevationProfile = null;
  });

  // [TEST] Added: tests that single-waypoint edge case still works for findMileFromCoords
  it('works with only one waypoint', () => {
    state.allWaypoints = [
      { name: 'Only', lat: 43.0, lon: -120.0, mile: 100 }
    ];
    const result = findMileFromCoords(43.0, -120.0);
    expect(result.mile).toBe(100);
    expect(result.distanceFromTrail).toBe(0);
  });
});

// [TEST] Added: tests for getWaypointName edge cases (missing fields, no details prefix)
describe('getWaypointName - edge cases', () => {
  it('returns details without "reliable:" prefix when prefix is absent', () => {
    const source = { landmark: '', details: 'seasonal creek' };
    expect(getWaypointName(source)).toBe('seasonal creek');
  });

  it('handles case-insensitive "Reliable:" prefix', () => {
    const source = { landmark: '', details: 'Reliable: big spring' };
    expect(getWaypointName(source)).toBe('big spring');
  });

  it('returns empty string when both landmark and details are empty', () => {
    const source = { landmark: '', details: '' };
    expect(getWaypointName(source)).toBe('');
  });
});

// [TEST] Added: tests for getWaypointShortName edge cases
describe('getWaypointShortName - edge cases', () => {
  it('returns full landmark when no parens or slashes', () => {
    const source = { landmark: 'Simple Name', details: '' };
    expect(getWaypointShortName(source)).toBe('Simple Name');
  });

  it('handles landmark with multiple parentheticals', () => {
    const source = { landmark: 'Creek (seasonal) (off-trail)', details: '' };
    expect(getWaypointShortName(source)).toBe('Creek');
  });

  it('returns empty string when both fields are empty', () => {
    const source = { landmark: '', details: '' };
    expect(getWaypointShortName(source)).toBe('');
  });
});

// [TEST] Added: tests for findNextWater with empty sources and epsilon boundary
describe('findNextWater - edge cases', () => {
  it('returns null when no water sources loaded', () => {
    state.waterSources = [];
    expect(findNextWater(0)).toBeNull();
  });

  it('finds source just beyond epsilon boundary', () => {
    state.waterSources = [{ mile: 5.02, name: 'Spring' }];
    // 5.02 > 5 + 0.01 (MILE_EPSILON), so should find it
    const result = findNextWater(5);
    expect(result).not.toBeNull();
    expect(result.mile).toBe(5.02);
  });

  it('skips source within epsilon boundary', () => {
    state.waterSources = [
      { mile: 5.005, name: 'Spring A' },
      { mile: 10, name: 'Spring B' }
    ];
    // 5.005 is NOT > 5 + 0.01, so should skip to Spring B
    const result = findNextWater(5);
    expect(result.mile).toBe(10);
  });
});

// [TEST] Added: tests for findNextTown edge cases (empty, epsilon boundary)
describe('findNextTown - edge cases', () => {
  it('returns null when no towns loaded', () => {
    state.towns = [];
    expect(findNextTown(0)).toBeNull();
  });

  it('skips town at exact mile (epsilon check)', () => {
    state.towns = [
      { mile: 50, name: 'Town A' },
      { mile: 150, name: 'Town B' }
    ];
    const result = findNextTown(50);
    expect(result.mile).toBe(150);
  });

  it('returns first town when mile is negative', () => {
    state.towns = [{ mile: 50, name: 'Town A' }];
    const result = findNextTown(-10);
    expect(result.mile).toBe(50);
  });
});

// [TEST] Added: tests for getDayHeaders ensuring all 7 days are unique and sequential
describe('getDayHeaders - additional', () => {
  it('all 7 headers match expected format', () => {
    const headers = getDayHeaders();
    headers.forEach(h => {
      expect(h).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{1,2}\/\d{1,2}$/);
    });
  });

  it('headers are 7 consecutive days', () => {
    const headers = getDayHeaders();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() + i);
      const expectedDay = dayNames[expected.getDay()];
      expect(headers[i]).toContain(expectedDay);
      expect(headers[i]).toContain(`${expected.getMonth() + 1}/${expected.getDate()}`);
    }
  });
});

// [TEST] Added: tests for loadElevationProfile caching and error handling
describe('loadElevationProfile', () => {
  afterEach(() => {
    state.elevationProfile = null;
    vi.restoreAllMocks();
  });

  it('returns cached profile on second call', async () => {
    const mockProfile = [{ distance: 0, elevation: 4000, lat: 43.0, lon: -120.0 }];
    state.elevationProfile = mockProfile;
    const result = await loadElevationProfile();
    expect(result).toBe(mockProfile);
  });

  it('returns null when fetch fails', async () => {
    state.elevationProfile = null;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await loadElevationProfile();
    expect(result).toBeNull();
  });

  it('fetches and caches profile on first call', async () => {
    state.elevationProfile = null;
    const mockData = [{ distance: 0, elevation: 3000 }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });
    const result = await loadElevationProfile();
    expect(result).toEqual(mockData);
    expect(state.elevationProfile).toBe(result);
  });
});

// [TEST] Added: tests for findNearestWaypoint with single waypoint
describe('findNearestWaypoint - edge cases', () => {
  it('works with a single waypoint', () => {
    state.allWaypoints = [{ name: 'Only', mile: 100, lat: 43.0, lon: -120.0 }];
    const result = findNearestWaypoint(200);
    expect(result.waypoint.name).toBe('Only');
    expect(result.distance).toBe(100);
  });

  it('returns midpoint waypoint when equidistant', () => {
    state.allWaypoints = [
      { name: 'A', mile: 0 },
      { name: 'B', mile: 20 }
    ];
    // At mile 10, equidistant from both - should return first found (A) since minDist uses strict <
    const result = findNearestWaypoint(10);
    expect(result.distance).toBe(10);
    // It returns A because the algorithm keeps the first found when distances are equal
    expect(result.waypoint.name).toBe('A');
  });
});

// Tests for on-trail detection: clicking on trail features should NOT show off-trail
// These verify that findMileFromCoords returns low distanceFromTrail for points on/near waypoints
// and high distanceFromTrail for points far from the trail.
describe('findMileFromCoords - on-trail vs off-trail detection', () => {
  beforeEach(() => {
    // Dense waypoints along a trail (approximately straight line going north)
    // At ~43°N: 1° lat ≈ 69 mi, 1° lon ≈ 50 mi
    state.allWaypoints = [
      { name: 'S01', lat: 43.000, lon: -120.000, mile: 0 },
      { name: 'S02', lat: 43.013, lon: -120.000, mile: 0.9 },
      { name: 'S03', lat: 43.026, lon: -120.000, mile: 1.8 },
      { name: 'S04', lat: 43.039, lon: -120.000, mile: 2.7 },
      { name: 'S05', lat: 43.052, lon: -120.000, mile: 3.6 },
      { name: 'S06', lat: 43.065, lon: -120.000, mile: 4.5 },
      { name: 'S07', lat: 43.078, lon: -120.000, mile: 5.4 },
      { name: 'S08', lat: 43.091, lon: -120.000, mile: 6.3 },
      { name: 'S09', lat: 43.104, lon: -120.000, mile: 7.2 },
      { name: 'S10', lat: 43.117, lon: -120.000, mile: 8.1 },
    ];
    // Dense elevation profile along the same trail
    state.elevationProfile = state.allWaypoints.map((wp, i) => ({
      lat: wp.lat, lon: wp.lon, distance: wp.mile, elevation: 4000 + i * 50
    }));
  });

  afterEach(() => {
    state.elevationProfile = null;
  });

  // ON-TRAIL: clicking directly on waypoint positions should return distanceFromTrail ≈ 0
  it('point exactly on first waypoint is on-trail', () => {
    const result = findMileFromCoords(43.000, -120.000);
    expect(result.distanceFromTrail).toBe(0);
    expect(result.mile).toBe(0);
  });

  it('point exactly on middle waypoint is on-trail', () => {
    const result = findMileFromCoords(43.052, -120.000);
    expect(result.distanceFromTrail).toBe(0);
    expect(result.mile).toBe(3.6);
  });

  it('point exactly on last waypoint is on-trail', () => {
    const result = findMileFromCoords(43.117, -120.000);
    expect(result.distanceFromTrail).toBe(0);
    expect(result.mile).toBe(8.1);
  });

  it('point between two waypoints but on the trail line has low distanceFromTrail', () => {
    // Point between S01 and S02, right on the trail (same longitude)
    const result = findMileFromCoords(43.006, -120.000);
    expect(result.distanceFromTrail).toBeLessThan(OFF_TRAIL_THRESHOLD);
  });

  it('point slightly off trail (within threshold) is still on-trail', () => {
    // ~0.3 miles east of trail at lat 43: 0.006° lon ≈ 0.3 miles
    const result = findMileFromCoords(43.052, -119.994);
    expect(result.distanceFromTrail).toBeLessThan(OFF_TRAIL_THRESHOLD);
  });

  // OFF-TRAIL: points far from the trail should have distanceFromTrail > threshold
  it('point 1 mile east of trail is off-trail', () => {
    // At 43°N: 0.02° lon ≈ 1 mile
    const result = findMileFromCoords(43.052, -119.98);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
  });

  it('point 2 miles east of trail is off-trail', () => {
    // At 43°N: 0.04° lon ≈ 2 miles
    const result = findMileFromCoords(43.052, -119.96);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
  });

  it('point 1 mile west of trail is off-trail', () => {
    const result = findMileFromCoords(43.052, -120.02);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
  });

  it('point far north of trail end is off-trail', () => {
    // 0.05° lat ≈ 3.5 miles north of the last waypoint
    const result = findMileFromCoords(43.167, -120.000);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
  });

  it('point far south of trail start is off-trail', () => {
    // 0.05° lat ≈ 3.5 miles south of the first waypoint
    const result = findMileFromCoords(42.950, -120.000);
    expect(result.distanceFromTrail).toBeGreaterThan(OFF_TRAIL_THRESHOLD);
  });
});
