import { describe, it, expect } from 'vitest';
import {
  sectionPoints,
  weatherIcons,
  MILE_EPSILON,
  WATER_WARNING_MILES,
  SCROLL_DELAY_MS,
  MAP_INIT_DELAY_MS
} from '../../public/js/config.js';

describe('sectionPoints', () => {
  it('has 25 sections', () => {
    expect(sectionPoints).toHaveLength(25);
  });

  it('starts at mile 0', () => {
    expect(sectionPoints[0].mile).toBe(0);
  });

  it('ends near mile 725', () => {
    expect(sectionPoints[24].mile).toBe(725);
  });

  it('has required properties on each point', () => {
    sectionPoints.forEach((point, index) => {
      expect(point).toHaveProperty('name');
      expect(point).toHaveProperty('lat');
      expect(point).toHaveProperty('lon');
      expect(point).toHaveProperty('mile');
      expect(point).toHaveProperty('elevation');
      expect(point).toHaveProperty('section');
      expect(point.section).toBe(index + 1);
    });
  });

  it('has valid coordinates for Oregon', () => {
    sectionPoints.forEach(point => {
      // Oregon latitude range roughly 42-46
      expect(point.lat).toBeGreaterThanOrEqual(42);
      expect(point.lat).toBeLessThanOrEqual(45);
      // Oregon longitude range roughly -124 to -117
      expect(point.lon).toBeGreaterThanOrEqual(-122);
      expect(point.lon).toBeLessThanOrEqual(-117);
    });
  });

  it('has miles in ascending order', () => {
    for (let i = 1; i < sectionPoints.length; i++) {
      expect(sectionPoints[i].mile).toBeGreaterThan(sectionPoints[i - 1].mile);
    }
  });
});

describe('weatherIcons', () => {
  const expectedIcons = [
    'clear-day',
    'clear-night',
    'rain',
    'snow',
    'sleet',
    'wind',
    'fog',
    'cloudy',
    'partly-cloudy-day',
    'partly-cloudy-night'
  ];

  it('has all expected weather icons', () => {
    expectedIcons.forEach(icon => {
      expect(weatherIcons).toHaveProperty(icon);
    });
  });

  it('icons are valid SVG strings', () => {
    Object.values(weatherIcons).forEach(svg => {
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  });
});

describe('constants', () => {
  it('MILE_EPSILON is a small positive number', () => {
    expect(MILE_EPSILON).toBeGreaterThan(0);
    expect(MILE_EPSILON).toBeLessThan(1);
  });

  it('WATER_WARNING_MILES is 20', () => {
    expect(WATER_WARNING_MILES).toBe(20);
  });

  it('SCROLL_DELAY_MS is reasonable', () => {
    expect(SCROLL_DELAY_MS).toBeGreaterThanOrEqual(50);
    expect(SCROLL_DELAY_MS).toBeLessThanOrEqual(500);
  });

  it('MAP_INIT_DELAY_MS is reasonable', () => {
    expect(MAP_INIT_DELAY_MS).toBeGreaterThanOrEqual(50);
    expect(MAP_INIT_DELAY_MS).toBeLessThanOrEqual(500);
  });
});
