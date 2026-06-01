import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readJson = (relativePath) => {
  const fullPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

describe('NNML route data', () => {
  const route = readJson('public/trails/nnml/route.geojson');
  const alternates = readJson('public/trails/nnml/alternates.geojson');
  const sections = readJson('public/trails/nnml/sections.json');

  it('contains the expected main sections and alternate tracks from GPX', () => {
    const main = route.features.filter((feature) => feature.properties.routeType === 'main');
    const alternate = route.features.filter((feature) => feature.properties.routeType === 'alternate');

    expect(route.features).toHaveLength(14);
    expect(main.map((feature) => feature.properties.section)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(alternate).toHaveLength(6);
    expect(new Set(route.features.map((feature) => feature.properties.id)).size).toBe(route.features.length);
  });

  it('keeps the standalone alternates file in sync with route alternate IDs', () => {
    const routeAlternateSources = route.features
      .filter((feature) => feature.properties.routeType === 'alternate')
      .map((feature) => feature.properties.source)
      .sort();
    const standaloneAlternateFiles = alternates.features
      .map((feature) => feature.properties.file)
      .sort();

    expect(standaloneAlternateFiles).toEqual(routeAlternateSources);
  });

  it('uses contrasting colors for touching main sections while allowing reuse later', () => {
    const mainBySection = new Map(
      route.features
        .filter((feature) => feature.properties.routeType === 'main')
        .map((feature) => [feature.properties.section, feature.properties])
    );

    for (let section = 1; section < 8; section += 1) {
      expect(mainBySection.get(section).color).not.toBe(mainBySection.get(section + 1).color);
    }
    expect(mainBySection.get(4).color).toBe(mainBySection.get(7).color);
  });

  it('colors alternate tracks to match their parent section', () => {
    const mainColors = new Map(
      route.features
        .filter((feature) => feature.properties.routeType === 'main')
        .map((feature) => [feature.properties.section, feature.properties.color])
    );

    route.features
      .filter((feature) => feature.properties.routeType === 'alternate')
      .forEach((feature) => {
        expect(feature.properties.color).toBe(mainColors.get(feature.properties.section));
      });
  });

  it('has section metadata for each main route section', () => {
    expect(sections.map((section) => section.section)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    sections.forEach((section) => {
      expect(section.name).toBeTruthy();
      expect(Number.isFinite(section.mile)).toBe(true);
      expect(Number.isFinite(section.lat)).toBe(true);
      expect(Number.isFinite(section.lon)).toBe(true);
    });
  });
});

describe('NNML water data', () => {
  const water = readJson('public/trails/nnml/water.json');

  it('preserves W ratings in water source text for configurable reliability', () => {
    const ratings = new Set();
    water.forEach((source) => {
      const text = [source.name, source.landmark, source.details].filter(Boolean).join(' ');
      const match = text.match(/\bW\s*([0-3])(?:\s*-\s*[0-3])?\b/i);
      if (match) ratings.add(`w${match[1]}`);
    });

    expect(ratings).toEqual(new Set(['w0', 'w1', 'w2', 'w3']));
  });

  it('includes imported water chart comments on matched sources', () => {
    const commentedSources = water.filter(source => Array.isArray(source.sheetComments) && source.sheetComments.length > 0);
    const commentCount = commentedSources.reduce((sum, source) => sum + source.sheetComments.length, 0);

    expect(commentedSources.length).toBeGreaterThan(100);
    expect(commentCount).toBeGreaterThan(700);
    expect(commentedSources[0].sheetComments[0]).toEqual(expect.objectContaining({
      author: expect.any(String),
      date: expect.any(String),
      text: expect.any(String),
      cell: expect.stringMatching(/^E\d+$/)
    }));
  });
});
